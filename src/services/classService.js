import { query, getClient } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { audit, AUDIT_ACTIONS } from '../utils/audit.js';
import { getPaginationParams } from '../utils/pagination.js';

const classListSelect = `
  SELECT 
    c.id, c.name, c.capacity, c.academic_year_id, c.grade_id,
    g.name AS grade_name,
    sec.id AS section_id, sec.name AS section_name,
    ay.name AS academic_year,
    lt.first_name AS teacher_first_name,
    lt.last_name AS teacher_last_name,
    COUNT(DISTINCT se.student_id)::int AS enrolled_count
  FROM academic.classes c
  JOIN academic.sections sec ON sec.id = c.section_id
  JOIN academic.academicyears ay ON ay.id = c.academic_year_id
  LEFT JOIN academic.grades g ON g.id = c.grade_id
  LEFT JOIN student.studentenrollments se 
    ON se.section_id = sec.id 
    AND se.academic_year_id = c.academic_year_id 
    AND se.status = 'active'
  LEFT JOIN LATERAL (
    SELECT u.first_name, u.last_name
    FROM academic.teacherassignments ta
    JOIN identity.users u ON u.id = ta.teacher_id
    WHERE ta.section_id = sec.id
    LIMIT 1
  ) lt ON true
`;

export const listClasses = async (schoolId, queryParams) => {
  const { page, limit, offset } = getPaginationParams(queryParams);
  const { search, academic_year_id } = queryParams;

  const conditions = ['c.school_id = $1'];
  const params = [schoolId];
  let idx = 2;

  if (search) {
    conditions.push(`(c.name ILIKE $${idx} OR sec.name ILIKE $${idx} OR g.name ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }
  if (academic_year_id) {
    conditions.push(`c.academic_year_id = $${idx++}`);
    params.push(academic_year_id);
  }

  const where = conditions.join(' AND ');

  const [rows, countResult] = await Promise.all([
    query(
      `${classListSelect}
       WHERE ${where}
       GROUP BY c.id, c.name, c.capacity, c.academic_year_id, c.grade_id, g.name,
                sec.id, sec.name, ay.name, lt.first_name, lt.last_name
       ORDER BY g.name NULLS LAST, sec.name, c.name
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    ),
    query(
      `SELECT COUNT(DISTINCT c.id) FROM academic.classes c
       JOIN academic.sections sec ON sec.id = c.section_id
       LEFT JOIN academic.grades g ON g.id = c.grade_id
       WHERE ${where}`,
      params
    ),
  ]);

  return { rows: rows.rows, total: parseInt(countResult.rows[0].count, 10), page, limit };
};

export const getClassById = async (schoolId, classId) => {
  const result = await query(
    `${classListSelect}
     WHERE c.school_id = $1 AND c.id = $2
     GROUP BY c.id, c.name, c.capacity, c.academic_year_id, c.grade_id, g.name,
              sec.id, sec.name, ay.name, lt.first_name, lt.last_name`,
    [schoolId, classId]
  );

  if (!result.rows[0]) throw new AppError('Class not found', 404, ERROR_CODES.NOT_FOUND);
  return result.rows[0];
};

export const getClassProfile = async (schoolId, classId) => {
  const base = await getClassById(schoolId, classId);

  const [students, assignments] = await Promise.all([
    query(
      `SELECT s.id, s.admission_number, s.first_name, s.last_name, s.gender, u.email, se.enrolled_at
       FROM student.studentenrollments se
       JOIN student.students s ON s.id = se.student_id AND s.deleted_at IS NULL
       JOIN identity.users u ON u.id = s.user_id
       WHERE se.section_id = $1 AND se.academic_year_id = $2 AND se.status = 'active'
       ORDER BY s.last_name, s.first_name`,
      [base.section_id, base.academic_year_id]
    ),
    query(
      `SELECT ta.id, ta.subject_id, sub.name AS subject_name,
              u.id AS teacher_user_id, u.first_name, u.last_name, u.email
       FROM academic.teacherassignments ta
       JOIN academic.subjects sub ON sub.id = ta.subject_id
       JOIN identity.users u ON u.id = ta.teacher_id
       WHERE ta.section_id = $1
       ORDER BY sub.name`,
      [base.section_id]
    ),
  ]);

  return {
    ...base,
    students: students.rows,
    assignments: assignments.rows,
    seats_available: Math.max(0, (base.capacity || 0) - (base.enrolled_count || 0)),
  };
};

export const createClass = async (data, schoolId, actorId) => {
  const { name, grade_id, grade_name, capacity, academic_year_id, section_name } = data;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    let resolvedGradeId = grade_id;
    if (!resolvedGradeId && grade_name?.trim()) {
      const existing = await client.query(
        `SELECT id FROM academic.grades WHERE school_id = $1 AND LOWER(name) = LOWER($2)`,
        [schoolId, grade_name.trim()]
      );
      if (existing.rows[0]) {
        resolvedGradeId = existing.rows[0].id;
      } else {
        const ins = await client.query(
          `INSERT INTO academic.grades (school_id, name) VALUES ($1, $2) RETURNING id`,
          [schoolId, grade_name.trim()]
        );
        resolvedGradeId = ins.rows[0].id;
      }
    }
    if (!resolvedGradeId) {
      throw new AppError('Grade is required (select or enter grade name).', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const gradeCheck = await client.query(
      `SELECT id FROM academic.grades WHERE id = $1 AND school_id = $2`,
      [resolvedGradeId, schoolId]
    );
    if (!gradeCheck.rows[0]) {
      throw new AppError('Grade not found in this school.', 404, ERROR_CODES.NOT_FOUND);
    }

    const yearCheck = await client.query(
      `SELECT id FROM academic.academicyears WHERE id = $1 AND school_id = $2`,
      [academic_year_id, schoolId]
    );
    if (!yearCheck.rows[0]) {
      throw new AppError('Academic year not found.', 404, ERROR_CODES.NOT_FOUND);
    }

    const sectionRes = await client.query(
      `INSERT INTO academic.sections (school_id, grade_id, name) 
       VALUES ($1, $2, $3) RETURNING id`,
      [schoolId, resolvedGradeId, section_name]
    );
    const sectionId = sectionRes.rows[0].id;

    const classRes = await client.query(
      `INSERT INTO academic.classes (school_id, section_id, name, grade_id, capacity, academic_year_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [schoolId, sectionId, name, resolvedGradeId, capacity, academic_year_id]
    );

    await client.query('COMMIT');

    audit({
      userId: actorId,
      schoolId,
      action: AUDIT_ACTIONS.CREATE,
      entity: 'class',
      entityId: classRes.rows[0].id,
    });

    return { class_id: classRes.rows[0].id, section_id: sectionId };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      throw new AppError('A class already exists for this section and academic year.', 409, ERROR_CODES.DUPLICATE_ENTRY);
    }
    throw err;
  } finally {
    client.release();
  }
};

export const assignTeacherToSection = async (schoolId, sectionId, payload, actorId) => {
  const { teacher_user_id, subject_id } = payload;

  const check = await query(
    `SELECT 
      (SELECT COUNT(*) FROM identity.users WHERE id = $1 AND school_id = $4) AS user_ok,
      (SELECT COUNT(*) FROM academic.subjects WHERE id = $2 AND school_id = $4) AS subject_ok,
      (SELECT COUNT(*) FROM academic.sections WHERE id = $3 AND school_id = $4) AS section_ok`,
    [teacher_user_id, subject_id, sectionId, schoolId]
  );

  const { user_ok, subject_ok, section_ok } = check.rows[0];
  if (Number(user_ok) === 0 || Number(subject_ok) === 0 || Number(section_ok) === 0) {
    throw new AppError('Teacher, subject, or section is invalid for this school.', 400, ERROR_CODES.INVALID_OPERATION);
  }

  let result;
  try {
    result = await query(
      `INSERT INTO academic.teacherassignments (teacher_id, subject_id, section_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [teacher_user_id, subject_id, sectionId]
    );
  } catch (err) {
    if (err.code === '23505') {
      throw new AppError('This teacher is already assigned to this subject and section.', 409, ERROR_CODES.DUPLICATE_ENTRY);
    }
    throw err;
  }

  audit({
    userId: actorId,
    schoolId,
    action: AUDIT_ACTIONS.UPDATE,
    entity: 'section',
    entityId: sectionId,
    meta: { teacher_user_id, subject_id },
  });

  return { assignment_id: result.rows[0]?.id, section_id: sectionId };
};

/**
 * Hasura Action: bulk-create grade sections + class instances for an academic year.
 * Idempotent via ON CONFLICT (section_id, academic_year_id).
 */
export const createClassesBulk = async (data, schoolId, actorId) => {
  const { academic_year_id, grade_name, sections } = data;

  if (!sections?.length) {
    throw new AppError('At least one section is required.', 400, ERROR_CODES.VALIDATION_ERROR);
  }

  const yearCheck = await query(
    `SELECT id FROM academic.academicyears WHERE id = $1 AND school_id = $2`,
    [academic_year_id, schoolId]
  );
  if (!yearCheck.rows[0]) {
    throw new AppError('Academic year not found in this school.', 404, ERROR_CODES.NOT_FOUND);
  }

  const client = await getClient();
  const createdClasses = [];

  try {
    await client.query('BEGIN');

    let gradeRes = await client.query(
      `SELECT id FROM academic.grades WHERE school_id = $1 AND name = $2`,
      [schoolId, grade_name]
    );
    let gradeId = gradeRes.rows[0]?.id;

    if (!gradeId) {
      const ins = await client.query(
        `INSERT INTO academic.grades (school_id, name) VALUES ($1, $2) RETURNING id`,
        [schoolId, grade_name]
      );
      gradeId = ins.rows[0].id;
    }

    for (const sec of sections) {
      const sectionName = sec.section_name;
      const capacity = sec.capacity ?? 30;

      let sectionRes = await client.query(
        `SELECT id FROM academic.sections 
         WHERE school_id = $1 AND grade_id = $2 AND name = $3`,
        [schoolId, gradeId, sectionName]
      );
      let sectionId = sectionRes.rows[0]?.id;

      if (!sectionId) {
        const ins = await client.query(
          `INSERT INTO academic.sections (school_id, grade_id, name) 
           VALUES ($1, $2, $3) RETURNING id`,
          [schoolId, gradeId, sectionName]
        );
        sectionId = ins.rows[0].id;
      }

      const className = `${grade_name} - ${sectionName}`;
      const classRes = await client.query(
        `INSERT INTO academic.classes (school_id, section_id, name, grade_id, capacity, academic_year_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (section_id, academic_year_id)
         DO UPDATE SET 
           capacity = EXCLUDED.capacity,
           name = EXCLUDED.name,
           grade_id = EXCLUDED.grade_id
         RETURNING id, name, capacity`,
        [schoolId, sectionId, className, gradeId, capacity, academic_year_id]
      );
      createdClasses.push(classRes.rows[0]);
    }

    await client.query('COMMIT');

    audit({
      userId: actorId,
      schoolId,
      action: AUDIT_ACTIONS.CREATE,
      entity: 'classes_bulk',
      entityId: gradeId,
      meta: { count: createdClasses.length, academic_year_id },
    });

    return { results: createdClasses.length, classes: createdClasses };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
