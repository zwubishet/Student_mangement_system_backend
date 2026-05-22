import { query, getClient } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';

const yearSelect = `id, school_id, name, start_date, end_date, status, is_current, is_deleted, created_at, updated_at`;

export const listAcademicYears = async (schoolId) => {
  const result = await query(
    `SELECT ${yearSelect}
     FROM academic.academicyears
     WHERE school_id = $1 AND is_deleted = false
     ORDER BY start_date DESC`,
    [schoolId]
  );
  return result.rows;
};

export const listAcademicYearsDetailed = async (schoolId) => {
  const result = await query(
    `SELECT ay.id, ay.name, ay.start_date, ay.end_date, ay.status, ay.is_current,
            COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'id', t.id,
                    'name', t.name,
                    'term_number', t.term_number,
                    'start_date', t.start_date,
                    'end_date', t.end_date,
                    'status', t.status,
                    'is_current', t.is_current
                  ) ORDER BY t.term_number
                )
                FROM academic.terms t
                WHERE t.academic_year_id = ay.id AND t.is_deleted = false
              ),
              '[]'::json
            ) AS terms,
            (
              SELECT COUNT(*)::int
              FROM student.studentenrollments se
              WHERE se.academic_year_id = ay.id AND se.status = 'active'
            ) AS enrollment_count,
            (
              SELECT COUNT(*)::int
              FROM academic.classes c
              WHERE c.academic_year_id = ay.id AND c.is_deleted = false
            ) AS class_count
     FROM academic.academicyears ay
     WHERE ay.school_id = $1 AND ay.is_deleted = false
     ORDER BY ay.start_date DESC`,
    [schoolId]
  );
  return result.rows.map((row) => ({
    ...row,
    terms: typeof row.terms === 'string' ? JSON.parse(row.terms) : row.terms || [],
  }));
};

export const getCurrentAcademicYear = async (schoolId) => {
  const result = await query(
    `SELECT ${yearSelect}
     FROM academic.academicyears
     WHERE school_id = $1 AND is_current = true AND is_deleted = false
     ORDER BY start_date DESC NULLS LAST
     LIMIT 1`,
    [schoolId]
  );
  if (result.rows[0]) return result.rows[0];
  const fallback = await query(
    `SELECT ${yearSelect}
     FROM academic.academicyears
     WHERE school_id = $1 AND is_deleted = false
     ORDER BY start_date DESC NULLS LAST
     LIMIT 1`,
    [schoolId]
  );
  return fallback.rows[0] || null;
};

export const createAcademicYear = async (schoolId, data, actorId) => {
  const { name, start_date, end_date, status = 'draft', is_current = false } = data;
  const client = await getClient();
  try {
    await client.query('BEGIN');
    if (is_current) {
      await client.query(
        `UPDATE academic.academicyears SET is_current = false, updated_at = NOW()
         WHERE school_id = $1 AND is_deleted = false`,
        [schoolId]
      );
    }
    const result = await client.query(
      `INSERT INTO academic.academicyears (
         school_id, name, start_date, end_date, status, is_current, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${yearSelect}`,
      [schoolId, name, start_date, end_date, status, !!is_current, actorId || null]
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      throw new AppError('Only one current academic year allowed per school.', 409, ERROR_CODES.DUPLICATE_ENTRY);
    }
    throw err;
  } finally {
    client.release();
  }
};

export const updateAcademicYear = async (schoolId, yearId, data, actorId) => {
  const allowed = ['name', 'start_date', 'end_date', 'status', 'is_current'];
  const fields = [];
  const params = [];
  let idx = 1;
  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${idx++}`);
      params.push(data[key]);
    }
  }
  if (!fields.length) throw new AppError('No valid fields to update.', 400, ERROR_CODES.VALIDATION_ERROR);

  const client = await getClient();
  try {
    await client.query('BEGIN');
    if (data.is_current) {
      await client.query(
        `UPDATE academic.academicyears SET is_current = false, updated_at = NOW()
         WHERE school_id = $1 AND id <> $2 AND is_deleted = false`,
        [schoolId, yearId]
      );
    }
    params.push(schoolId, yearId);
    const result = await client.query(
      `UPDATE academic.academicyears SET ${fields.join(', ')}, updated_at = NOW()
       WHERE school_id = $${idx++} AND id = $${idx} AND is_deleted = false
       RETURNING ${yearSelect}`,
      params
    );
    if (!result.rows[0]) throw new AppError('Academic year not found.', 404, ERROR_CODES.NOT_FOUND);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      throw new AppError('Only one current academic year allowed per school.', 409, ERROR_CODES.DUPLICATE_ENTRY);
    }
    throw err;
  } finally {
    client.release();
  }
};

export const setCurrentAcademicYear = async (schoolId, yearId) =>
  updateAcademicYear(schoolId, yearId, { is_current: true, status: 'active' });

export const createTerm = async (schoolId, data, actorId) => {
  const {
    academic_year_id, name, start_date, end_date,
    term_number, status = 'upcoming', is_current = false,
  } = data;

  const yearRes = await query(
    `SELECT start_date, end_date FROM academic.academicyears
     WHERE id = $1 AND school_id = $2 AND is_deleted = false`,
    [academic_year_id, schoolId]
  );
  if (!yearRes.rows[0]) throw new AppError('Academic year not found.', 404, ERROR_CODES.NOT_FOUND);

  const year = yearRes.rows[0];
  if (new Date(start_date) < new Date(year.start_date) || new Date(end_date) > new Date(year.end_date)) {
    throw new AppError(
      `Term dates must be within ${year.start_date} and ${year.end_date}`,
      400,
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  let termNum = term_number;
  if (!termNum) {
    const next = await query(
      `SELECT COALESCE(MAX(term_number), 0) + 1 AS n FROM academic.terms
       WHERE academic_year_id = $1 AND is_deleted = false`,
      [academic_year_id]
    );
    termNum = next.rows[0].n;
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    if (is_current) {
      await client.query(
        `UPDATE academic.terms SET is_current = false, updated_at = NOW()
         WHERE academic_year_id = $1 AND is_deleted = false`,
        [academic_year_id]
      );
    }
    const result = await client.query(
      `INSERT INTO academic.terms (
         school_id, academic_year_id, name, term_number, start_date, end_date, status, is_current
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, term_number, start_date, end_date, status, is_current, academic_year_id`,
      [schoolId, academic_year_id, name, termNum, start_date, end_date, status, !!is_current]
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      throw new AppError('Term number already exists for this year.', 409, ERROR_CODES.DUPLICATE_ENTRY);
    }
    throw err;
  } finally {
    client.release();
  }
};

export const listTerms = async (schoolId, academicYearId) => {
  const params = [schoolId];
  let sql = `
    SELECT t.id, t.name, t.term_number, t.start_date, t.end_date, t.status, t.is_current, t.academic_year_id
    FROM academic.terms t
    WHERE t.school_id = $1 AND t.is_deleted = false`;
  if (academicYearId) {
    params.push(academicYearId);
    sql += ` AND t.academic_year_id = $2`;
  }
  sql += ' ORDER BY t.term_number';
  const result = await query(sql, params);
  return result.rows;
};

/** Grade levels — table: academic.grades */
export const listGrades = async (schoolId) => {
  const result = await query(
    `SELECT id, name, level_order, created_at, updated_at
     FROM academic.grades
     WHERE school_id = $1
     ORDER BY level_order NULLS LAST, name`,
    [schoolId]
  );
  return result.rows;
};

export const createGradeLevel = async (schoolId, { name, level_order }) => {
  let order = level_order;
  if (order == null) {
    const next = await query(
      `SELECT COALESCE(MAX(level_order), 0) + 1 AS n FROM academic.grades WHERE school_id = $1`,
      [schoolId]
    );
    order = next.rows[0].n;
  }
  const result = await query(
    `INSERT INTO academic.grades (school_id, name, level_order)
     VALUES ($1, $2, $3) RETURNING id, name, level_order`,
    [schoolId, name, order]
  );
  return result.rows[0];
};

export const listSections = async (schoolId, gradeId) => {
  const params = [schoolId];
  let sql = `
    SELECT s.id, s.name, s.grade_id, g.name AS grade_name, g.level_order
    FROM academic.sections s
    JOIN academic.grades g ON g.id = s.grade_id
    WHERE s.school_id = $1`;
  if (gradeId) {
    params.push(gradeId);
    sql += ` AND s.grade_id = $2`;
  }
  sql += ' ORDER BY g.level_order NULLS LAST, g.name, s.name';
  const result = await query(sql, params);
  return result.rows;
};

export const listSubjects = async (schoolId) => {
  const result = await query(
    `SELECT id, name, code, description, is_core, created_at
     FROM academic.subjects
     WHERE school_id = $1 AND is_deleted = false
     ORDER BY is_core DESC, name`,
    [schoolId]
  );
  return result.rows;
};

export const createSubject = async (schoolId, data) => {
  const result = await query(
    `INSERT INTO academic.subjects (school_id, name, code, description, is_core)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, code, description, is_core`,
    [schoolId, data.name, data.code || null, data.description || null, data.is_core !== false]
  );
  return result.rows[0];
};

export const listActiveClasses = async (schoolId, academicYearId) => {
  const params = [schoolId];
  let sql = `
    SELECT c.id, c.name, c.section_id, c.capacity, c.grade_id, c.grade_level_id,
           c.academic_year_id, c.room_number,
           sec.name AS section_name,
           COALESCE(gl.name, g.name) AS grade_name
    FROM academic.classes c
    LEFT JOIN academic.sections sec ON sec.id = c.section_id
    LEFT JOIN academic.grades g ON g.id = c.grade_id
    LEFT JOIN academic.grades gl ON gl.id = c.grade_level_id
    WHERE c.school_id = $1 AND c.is_deleted = false`;
  if (academicYearId) {
    params.push(academicYearId);
    sql += ` AND c.academic_year_id = $2`;
  }
  sql += ' ORDER BY grade_name, c.name';
  const result = await query(sql, params);
  return result.rows;
};

export const listClassSubjects = async (schoolId, classId) => {
  const result = await query(
    `SELECT cs.id, cs.class_id, cs.subject_id, cs.periods_per_week,
            sub.name AS subject_name, sub.code AS subject_code
     FROM academic.class_subjects cs
     JOIN academic.subjects sub ON sub.id = cs.subject_id
     WHERE cs.school_id = $1 AND cs.class_id = $2
     ORDER BY sub.name`,
    [schoolId, classId]
  );
  return result.rows;
};

export const addClassSubject = async (schoolId, { class_id, subject_id, periods_per_week = 5 }) => {
  const result = await query(
    `INSERT INTO academic.class_subjects (school_id, class_id, subject_id, periods_per_week)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (class_id, subject_id) DO UPDATE SET periods_per_week = EXCLUDED.periods_per_week
     RETURNING *`,
    [schoolId, class_id, subject_id, periods_per_week]
  );
  return result.rows[0];
};

export const listTimetableSlots = async (schoolId, { class_id, section_id, academic_year_id } = {}) => {
  const params = [schoolId];
  let sql = `
    SELECT ts.*, sub.name AS subject_name,
           u.first_name AS teacher_first_name, u.last_name AS teacher_last_name,
           c.id AS class_id, c.name AS class_name, sec.id AS section_id, sec.name AS section_name,
           g.name AS grade_name, ay.name AS academic_year
    FROM academic.timetable_slots ts
    JOIN academic.subjects sub ON sub.id = ts.subject_id
    JOIN academic.classes c ON c.id = ts.class_id
    JOIN academic.sections sec ON sec.id = c.section_id
    LEFT JOIN academic.grades g ON g.id = sec.grade_id
    LEFT JOIN academic.academicyears ay ON ay.id = c.academic_year_id
    LEFT JOIN identity.users u ON u.id = ts.teacher_id
    WHERE ts.school_id = $1 AND COALESCE(c.is_deleted, false) = false`;
  if (class_id) {
    params.push(class_id);
    sql += ` AND ts.class_id = $${params.length}`;
  }
  if (section_id) {
    params.push(section_id);
    sql += ` AND c.section_id = $${params.length}`;
  }
  if (academic_year_id) {
    params.push(academic_year_id);
    sql += ` AND c.academic_year_id = $${params.length}`;
  }
  sql += ' ORDER BY ts.day_of_week, ts.period_number, sub.name';
  const result = await query(sql, params);
  return result.rows;
};

/** Section-level timetable view for admin (all slots for section's class in a year). */
export const getSectionTimetableBundle = async (schoolId, sectionId, academicYearId) => {
  const section = await getSection(schoolId, sectionId);
  if (!section) throw new AppError('Section not found.', 404, ERROR_CODES.NOT_FOUND);

  const classForYear = academicYearId
    ? section.linked_classes?.find((c) => c.academic_year_id === academicYearId)
    : section.linked_classes?.[0];

  const slots = await listTimetableSlots(schoolId, {
    section_id: sectionId,
    academic_year_id: academicYearId || undefined,
  });

  return {
    section: {
      id: section.id,
      name: section.name,
      grade_id: section.grade_id,
      grade_name: section.grade_name,
    },
    academic_year_id: academicYearId || null,
    class: classForYear || null,
    linked_classes: section.linked_classes || [],
    slots,
    summary: {
      slot_count: slots.length,
      days_used: [...new Set(slots.map((s) => s.day_of_week))].length,
    },
  };
};

export const createTimetableSlot = async (schoolId, data) => {
  const result = await query(
    `INSERT INTO academic.timetable_slots (
       school_id, class_id, subject_id, teacher_id, day_of_week, period_number, start_time, end_time
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      schoolId,
      data.class_id,
      data.subject_id,
      data.teacher_id || null,
      data.day_of_week,
      data.period_number,
      data.start_time,
      data.end_time,
    ]
  ).catch((err) => {
    if (err.code === '23505') {
      throw new AppError('Slot already exists for this class/day/period.', 409, ERROR_CODES.DUPLICATE_ENTRY);
    }
    throw err;
  });
  return result.rows[0];
};

// ─── Terms (full CRUD) ────────────────────────────────────────────────────────

export const getTerm = async (schoolId, termId) => {
  const result = await query(
    `SELECT t.*, ay.name AS academic_year_name,
            (SELECT COUNT(*)::int FROM academic.attendance a WHERE a.term_id = t.id) AS attendance_records,
            (SELECT COUNT(*)::int FROM operations.exams e WHERE e.term_id = t.id) AS exam_count
     FROM academic.terms t
     JOIN academic.academicyears ay ON ay.id = t.academic_year_id
     WHERE t.id = $1 AND t.school_id = $2 AND t.is_deleted = false`,
    [termId, schoolId]
  );
  if (!result.rows[0]) throw new AppError('Term not found.', 404, ERROR_CODES.NOT_FOUND);
  return result.rows[0];
};

export const updateTerm = async (schoolId, termId, data) => {
  const existing = await getTerm(schoolId, termId);
  const allowed = ['name', 'start_date', 'end_date', 'term_number', 'status', 'is_current'];
  const fields = [];
  const params = [];
  let idx = 1;
  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${idx++}`);
      params.push(data[key]);
    }
  }
  if (!fields.length) throw new AppError('No valid fields to update.', 400, ERROR_CODES.VALIDATION_ERROR);

  if (data.start_date || data.end_date) {
    const year = await query(
      `SELECT start_date, end_date FROM academic.academicyears WHERE id = $1`,
      [existing.academic_year_id]
    );
    const start = data.start_date || existing.start_date;
    const end = data.end_date || existing.end_date;
    const y = year.rows[0];
    if (new Date(start) < new Date(y.start_date) || new Date(end) > new Date(y.end_date)) {
      throw new AppError('Term dates must fall within the academic year range.', 400, ERROR_CODES.VALIDATION_ERROR);
    }
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    if (data.is_current) {
      await client.query(
        `UPDATE academic.terms SET is_current = false, updated_at = NOW()
         WHERE academic_year_id = $1 AND is_deleted = false AND id <> $2`,
        [existing.academic_year_id, termId]
      );
    }
    params.push(schoolId, termId);
    const result = await client.query(
      `UPDATE academic.terms SET ${fields.join(', ')}, updated_at = NOW()
       WHERE school_id = $${idx++} AND id = $${idx} AND is_deleted = false RETURNING *`,
      params
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') throw new AppError('Term number already used in this year.', 409, ERROR_CODES.DUPLICATE_ENTRY);
    throw err;
  } finally {
    client.release();
  }
};

export const setCurrentTerm = async (schoolId, termId) =>
  updateTerm(schoolId, termId, { is_current: true, status: 'active' });

export const deleteTerm = async (schoolId, termId) => {
  const t = await getTerm(schoolId, termId);
  if (t.attendance_records > 0 || t.exam_count > 0) {
    throw new AppError(
      `Cannot delete term: ${t.attendance_records} attendance record(s) and ${t.exam_count} exam(s) linked. Close the term instead.`,
      400,
      ERROR_CODES.VALIDATION_ERROR
    );
  }
  await query(
    `UPDATE academic.terms SET is_deleted = true, is_current = false, status = 'closed', updated_at = NOW()
     WHERE id = $1 AND school_id = $2`,
    [termId, schoolId]
  );
  return { deleted: true };
};

export const deleteAcademicYear = async (schoolId, yearId) => {
  const deps = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM student.studentenrollments WHERE academic_year_id = $1 AND status = 'active') AS enrollments,
       (SELECT COUNT(*)::int FROM academic.classes WHERE academic_year_id = $1 AND is_deleted = false) AS classes`,
    [yearId]
  );
  const d = deps.rows[0];
  if (d.enrollments > 0) {
    throw new AppError(`Cannot delete year: ${d.enrollments} active student enrollment(s).`, 400, ERROR_CODES.VALIDATION_ERROR);
  }
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE academic.terms SET is_deleted = true, is_current = false WHERE academic_year_id = $1`,
      [yearId]
    );
    await client.query(
      `UPDATE academic.classes SET is_deleted = true WHERE academic_year_id = $1 AND school_id = $2`,
      [yearId, schoolId]
    );
    const r = await client.query(
      `UPDATE academic.academicyears SET is_deleted = true, is_current = false, status = 'closed', updated_at = NOW()
       WHERE id = $1 AND school_id = $2 AND is_deleted = false RETURNING id`,
      [yearId, schoolId]
    );
    if (!r.rows[0]) throw new AppError('Academic year not found.', 404, ERROR_CODES.NOT_FOUND);
    await client.query('COMMIT');
    return { deleted: true };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

// ─── Grades ───────────────────────────────────────────────────────────────────

export const getGradeLevel = async (schoolId, gradeId) => {
  const result = await query(
    `SELECT g.*,
            (SELECT COUNT(*)::int FROM academic.sections s WHERE s.grade_id = g.id) AS section_count,
            (SELECT COUNT(*)::int FROM academic.classes c WHERE c.grade_level_id = g.id AND c.is_deleted = false) AS class_count
     FROM academic.grades g WHERE g.id = $1 AND g.school_id = $2`,
    [gradeId, schoolId]
  );
  if (!result.rows[0]) throw new AppError('Grade not found.', 404, ERROR_CODES.NOT_FOUND);
  return result.rows[0];
};

export const updateGradeLevel = async (schoolId, gradeId, data) => {
  const fields = [];
  const params = [];
  let idx = 1;
  if (data.name !== undefined) { fields.push(`name = $${idx++}`); params.push(data.name); }
  if (data.level_order !== undefined) { fields.push(`level_order = $${idx++}`); params.push(data.level_order); }
  if (!fields.length) throw new AppError('No valid fields to update.', 400, ERROR_CODES.VALIDATION_ERROR);
  params.push(schoolId, gradeId);
  const result = await query(
    `UPDATE academic.grades SET ${fields.join(', ')}, updated_at = NOW()
     WHERE school_id = $${idx++} AND id = $${idx} RETURNING id, name, level_order`,
    params
  ).catch((err) => {
    if (err.code === '23505') throw new AppError('Grade order already used.', 409, ERROR_CODES.DUPLICATE_ENTRY);
    throw err;
  });
  if (!result.rows[0]) throw new AppError('Grade not found.', 404, ERROR_CODES.NOT_FOUND);
  return result.rows[0];
};

export const deleteGradeLevel = async (schoolId, gradeId) => {
  const g = await getGradeLevel(schoolId, gradeId);
  if (g.section_count > 0) {
    throw new AppError(`Cannot delete grade: ${g.section_count} section(s) exist. Remove sections first.`, 400, ERROR_CODES.VALIDATION_ERROR);
  }
  await query(`DELETE FROM academic.grades WHERE id = $1 AND school_id = $2`, [gradeId, schoolId]);
  return { deleted: true };
};

// ─── Sections ─────────────────────────────────────────────────────────────────

export const createSection = async (schoolId, { name, grade_id }) => {
  const grade = await query(`SELECT id FROM academic.grades WHERE id = $1 AND school_id = $2`, [grade_id, schoolId]);
  if (!grade.rows[0]) throw new AppError('Grade not found.', 404, ERROR_CODES.NOT_FOUND);
  const result = await query(
    `INSERT INTO academic.sections (school_id, grade_id, name) VALUES ($1, $2, $3) RETURNING *`,
    [schoolId, grade_id, name]
  ).catch((err) => {
    if (err.code === '23505') throw new AppError('Section name already exists for this grade.', 409, ERROR_CODES.DUPLICATE_ENTRY);
    throw err;
  });
  return result.rows[0];
};

export const getSection = async (schoolId, sectionId) => {
  const result = await query(
    `SELECT s.*, g.name AS grade_name, g.level_order,
            (SELECT COUNT(*)::int FROM academic.classes c WHERE c.section_id = s.id AND c.is_deleted = false) AS class_count,
            (SELECT COUNT(*)::int FROM student.studentenrollments e WHERE e.section_id = s.id AND e.status = 'active') AS active_enrollments,
            (SELECT COUNT(*)::int FROM academic.teacherassignments ta WHERE ta.section_id = s.id) AS teacher_assignments,
            COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'id', c.id,
                    'name', c.name,
                    'academic_year_id', c.academic_year_id,
                    'academic_year', ay.name,
                    'capacity', c.capacity,
                    'enrolled_count', (
                      SELECT COUNT(*)::int FROM student.studentenrollments se
                      WHERE se.section_id = s.id AND se.academic_year_id = c.academic_year_id AND se.status = 'active'
                    )
                  ) ORDER BY ay.start_date DESC
                )
                FROM academic.classes c
                JOIN academic.academicyears ay ON ay.id = c.academic_year_id
                WHERE c.section_id = s.id AND c.is_deleted = false
              ),
              '[]'::json
            ) AS linked_classes
     FROM academic.sections s
     JOIN academic.grades g ON g.id = s.grade_id
     WHERE s.id = $1 AND s.school_id = $2`,
    [sectionId, schoolId]
  );
  if (!result.rows[0]) throw new AppError('Section not found.', 404, ERROR_CODES.NOT_FOUND);
  const row = result.rows[0];
  return {
    ...row,
    linked_classes: typeof row.linked_classes === 'string'
      ? JSON.parse(row.linked_classes)
      : row.linked_classes || [],
  };
};

export const listSectionsDetailed = async (schoolId, gradeId) => {
  const params = [schoolId];
  let sql = `
    SELECT s.id, s.name, s.grade_id, g.name AS grade_name, g.level_order,
           (SELECT COUNT(*)::int FROM academic.classes c WHERE c.section_id = s.id AND c.is_deleted = false) AS class_count,
           (SELECT COUNT(*)::int FROM student.studentenrollments e WHERE e.section_id = s.id AND e.status = 'active') AS active_enrollments,
           COALESCE(
             (
               SELECT json_agg(
                 json_build_object(
                   'id', c.id,
                   'name', c.name,
                   'academic_year_id', c.academic_year_id,
                   'academic_year', ay.name,
                   'capacity', c.capacity,
                   'enrolled_count', (
                     SELECT COUNT(*)::int FROM student.studentenrollments se
                     WHERE se.section_id = s.id AND se.academic_year_id = c.academic_year_id AND se.status = 'active'
                   )
                 ) ORDER BY ay.start_date DESC
               )
               FROM academic.classes c
               JOIN academic.academicyears ay ON ay.id = c.academic_year_id
               WHERE c.section_id = s.id AND c.is_deleted = false
             ),
             '[]'::json
           ) AS linked_classes
    FROM academic.sections s
    JOIN academic.grades g ON g.id = s.grade_id
    WHERE s.school_id = $1`;
  if (gradeId) {
    params.push(gradeId);
    sql += ` AND s.grade_id = $2`;
  }
  sql += ' ORDER BY g.level_order, s.name';
  const rows = (await query(sql, params)).rows;
  return rows.map((row) => ({
    ...row,
    linked_classes: typeof row.linked_classes === 'string'
      ? JSON.parse(row.linked_classes)
      : row.linked_classes || [],
  }));
};

export const updateSection = async (schoolId, sectionId, data) => {
  const fields = [];
  const params = [];
  let idx = 1;
  if (data.name !== undefined) { fields.push(`name = $${idx++}`); params.push(data.name); }
  if (data.grade_id !== undefined) { fields.push(`grade_id = $${idx++}`); params.push(data.grade_id); }
  if (!fields.length) throw new AppError('No valid fields to update.', 400, ERROR_CODES.VALIDATION_ERROR);
  params.push(schoolId, sectionId);
  const result = await query(
    `UPDATE academic.sections SET ${fields.join(', ')} WHERE school_id = $${idx++} AND id = $${idx} RETURNING *`,
    params
  ).catch((err) => {
    if (err.code === '23505') throw new AppError('Section name already exists for this grade.', 409, ERROR_CODES.DUPLICATE_ENTRY);
    throw err;
  });
  if (!result.rows[0]) throw new AppError('Section not found.', 404, ERROR_CODES.NOT_FOUND);
  return result.rows[0];
};

export const deleteSection = async (schoolId, sectionId) => {
  const s = await getSection(schoolId, sectionId);
  if (s.active_enrollments > 0) {
    throw new AppError(`Cannot delete section: ${s.active_enrollments} active enrollment(s). Transfer or withdraw students first.`, 400, ERROR_CODES.VALIDATION_ERROR);
  }
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM operations.examresults er
      USING operations.examsubjects es
      WHERE er.exam_subject_id = es.id AND es.section_id = $1`, [sectionId]);
    await client.query(`DELETE FROM operations.examsubjects WHERE section_id = $1`, [sectionId]);
    await client.query(`DELETE FROM academic.teacherassignments WHERE section_id = $1`, [sectionId]);
    try {
      await client.query(`DELETE FROM operations.schedules WHERE section_id = $1`, [sectionId]);
    } catch (schedErr) {
      if (schedErr.code !== '42P01') throw schedErr;
    }
    await client.query(`UPDATE academic.classes SET is_deleted = true, updated_at = NOW() WHERE section_id = $1`, [sectionId]);
    const del = await client.query(
      `DELETE FROM academic.sections WHERE id = $1 AND school_id = $2 RETURNING id`,
      [sectionId, schoolId]
    );
    if (!del.rows[0]) throw new AppError('Section not found.', 404, ERROR_CODES.NOT_FOUND);
    await client.query('COMMIT');
    return { deleted: true };
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23503') {
      throw new AppError('Cannot delete section: it is still referenced by enrollments or other records.', 400, ERROR_CODES.VALIDATION_ERROR);
    }
    throw e;
  } finally {
    client.release();
  }
};

// ─── Subjects ─────────────────────────────────────────────────────────────────

export const listSubjectsDetailed = async (schoolId) => {
  const result = await query(
    `SELECT s.id, s.name, s.code, s.description, s.is_core, s.created_at,
            (SELECT COUNT(*)::int FROM academic.class_subjects cs WHERE cs.subject_id = s.id) AS class_assignments,
            (SELECT COUNT(*)::int FROM academic.timetable_slots ts WHERE ts.subject_id = s.id) AS timetable_slots,
            (SELECT COUNT(*)::int FROM academic.teacherassignments ta WHERE ta.subject_id = s.id) AS teacher_assignments,
            (SELECT COUNT(*)::int FROM operations.examsubjects es WHERE es.subject_id = s.id) AS exam_links
     FROM academic.subjects s
     WHERE s.school_id = $1 AND s.is_deleted = false
     ORDER BY s.is_core DESC, s.name`,
    [schoolId]
  );
  return result.rows;
};

export const getSubject = async (schoolId, subjectId) => {
  const result = await query(
    `SELECT s.*,
            (SELECT COUNT(*)::int FROM academic.class_subjects cs WHERE cs.subject_id = s.id) AS class_assignments,
            (SELECT COUNT(*)::int FROM academic.teacherassignments ta WHERE ta.subject_id = s.id) AS teacher_assignments
     FROM academic.subjects s
     WHERE s.id = $1 AND s.school_id = $2 AND s.is_deleted = false`,
    [subjectId, schoolId]
  );
  if (!result.rows[0]) throw new AppError('Subject not found.', 404, ERROR_CODES.NOT_FOUND);
  return result.rows[0];
};

export const updateSubject = async (schoolId, subjectId, data) => {
  const fields = [];
  const params = [];
  let idx = 1;
  for (const key of ['name', 'code', 'description', 'is_core']) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${idx++}`);
      params.push(key === 'is_core' ? data[key] !== false : (data[key] || null));
    }
  }
  if (!fields.length) throw new AppError('No valid fields to update.', 400, ERROR_CODES.VALIDATION_ERROR);
  params.push(schoolId, subjectId);
  const result = await query(
    `UPDATE academic.subjects SET ${fields.join(', ')}, updated_at = NOW()
     WHERE school_id = $${idx++} AND id = $${idx} AND is_deleted = false
     RETURNING id, name, code, description, is_core`,
    params
  ).catch((err) => {
    if (err.code === '23505') throw new AppError('Subject code already exists.', 409, ERROR_CODES.DUPLICATE_ENTRY);
    throw err;
  });
  if (!result.rows[0]) throw new AppError('Subject not found.', 404, ERROR_CODES.NOT_FOUND);
  return result.rows[0];
};

export const deleteSubject = async (schoolId, subjectId, { force = false } = {}) => {
  const s = await getSubject(schoolId, subjectId);
  const blocking = s.class_assignments + s.teacher_assignments;
  if (blocking > 0 && !force) {
    throw new AppError(
      `Subject has ${s.class_assignments} class link(s) and ${s.teacher_assignments} teacher assignment(s). Pass force=true to unlink and delete.`,
      400,
      ERROR_CODES.VALIDATION_ERROR
    );
  }
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM academic.class_subjects WHERE subject_id = $1`, [subjectId]);
    await client.query(`DELETE FROM academic.timetable_slots WHERE subject_id = $1`, [subjectId]);
    await client.query(
      `UPDATE academic.subjects SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND school_id = $2`,
      [subjectId, schoolId]
    );
    await client.query('COMMIT');
    return { deleted: true };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

export const removeClassSubject = async (schoolId, linkId) => {
  const result = await query(
    `DELETE FROM academic.class_subjects WHERE id = $1 AND school_id = $2 RETURNING id`,
    [linkId, schoolId]
  );
  if (!result.rows[0]) throw new AppError('Class-subject link not found.', 404, ERROR_CODES.NOT_FOUND);
  return { deleted: true };
};

export const updateClassSubject = async (schoolId, linkId, { periods_per_week }) => {
  const result = await query(
    `UPDATE academic.class_subjects SET periods_per_week = $3
     WHERE id = $1 AND school_id = $2 RETURNING *`,
    [linkId, schoolId, periods_per_week]
  );
  if (!result.rows[0]) throw new AppError('Class-subject link not found.', 404, ERROR_CODES.NOT_FOUND);
  return result.rows[0];
};

export const bulkAssignSubjectsToClass = async (schoolId, { class_id, subject_ids, periods_per_week = 5 }) => {
  if (!subject_ids?.length) throw new AppError('No subjects selected.', 400, ERROR_CODES.VALIDATION_ERROR);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const rows = [];
    for (const subjectId of subject_ids) {
      const r = await client.query(
        `INSERT INTO academic.class_subjects (school_id, class_id, subject_id, periods_per_week)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (class_id, subject_id) DO UPDATE SET periods_per_week = EXCLUDED.periods_per_week
         RETURNING *`,
        [schoolId, class_id, subjectId, periods_per_week]
      );
      rows.push(r.rows[0]);
    }
    await client.query('COMMIT');
    return rows;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

export const deleteTimetableSlot = async (schoolId, slotId) => {
  const result = await query(
    `DELETE FROM academic.timetable_slots WHERE id = $1 AND school_id = $2 RETURNING id`,
    [slotId, schoolId]
  );
  if (!result.rows[0]) throw new AppError('Timetable slot not found.', 404, ERROR_CODES.NOT_FOUND);
  return { deleted: true };
};

export const getAcademicStructureOverview = async (schoolId) => {
  const result = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM academic.academicyears WHERE school_id = $1 AND is_deleted = false) AS years,
       (SELECT COUNT(*)::int FROM academic.terms WHERE school_id = $1 AND is_deleted = false) AS terms,
       (SELECT COUNT(*)::int FROM academic.grades WHERE school_id = $1) AS grades,
       (SELECT COUNT(*)::int FROM academic.sections WHERE school_id = $1) AS sections,
       (SELECT COUNT(*)::int FROM academic.subjects WHERE school_id = $1 AND is_deleted = false) AS subjects,
       (SELECT COUNT(*)::int FROM academic.classes WHERE school_id = $1 AND is_deleted = false) AS classes`,
    [schoolId]
  );
  const current = await getCurrentAcademicYear(schoolId);
  return { ...result.rows[0], current_year: current };
};
