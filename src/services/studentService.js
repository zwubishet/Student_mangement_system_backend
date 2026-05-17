import { query, getClient } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { hashPassword } from '../utils/auth.js';
import { audit, AUDIT_ACTIONS } from '../utils/audit.js';
import { getPaginationParams } from '../utils/pagination.js';
import { logStudentActivity } from '../utils/entityActivity.js';

const SORT_COLUMNS = {
  name: 's.last_name',
  admission_number: 's.admission_number',
  created_at: 's.created_at',
  enrolled_at: 'se.enrolled_at',
  grade: 'g.name',
};

const buildListFilters = (schoolId, q) => {
  const conditions = ['s.school_id = $1'];
  const params = [schoolId];
  let idx = 2;

  if (q.include_deleted !== 'true') conditions.push('s.deleted_at IS NULL');
  if (q.include_archived !== 'true') conditions.push(`s.lifecycle_status != 'archived'`);

  if (q.search) {
    conditions.push(
      `(s.first_name ILIKE $${idx} OR s.last_name ILIKE $${idx} OR s.admission_number ILIKE $${idx} OR u.email ILIKE $${idx})`
    );
    params.push(`%${q.search}%`);
    idx++;
  }
  if (q.status) {
    conditions.push(`COALESCE(s.lifecycle_status, u.status) = $${idx++}`);
    params.push(q.status);
  }
  if (q.gender) {
    conditions.push(`s.gender = $${idx++}`);
    params.push(q.gender);
  }
  if (q.section_id) {
    conditions.push(`se.section_id = $${idx++}`);
    params.push(q.section_id);
  }
  if (q.academic_year_id) {
    conditions.push(`se.academic_year_id = $${idx++}`);
    params.push(q.academic_year_id);
  }
  if (q.grade_id) {
    conditions.push(`g.id = $${idx++}`);
    params.push(q.grade_id);
  }
  if (q.enrolled_from) {
    conditions.push(`se.enrolled_at >= $${idx++}`);
    params.push(q.enrolled_from);
  }
  if (q.enrolled_to) {
    conditions.push(`se.enrolled_at <= $${idx++}`);
    params.push(q.enrolled_to);
  }

  return { conditions, params, idx };
};

const listFromClause = `
  FROM student.students s
  JOIN identity.users u ON s.user_id = u.id
  LEFT JOIN student.studentenrollments se ON se.student_id = s.id AND se.status = 'active'
  LEFT JOIN academic.sections sec ON sec.id = se.section_id
  LEFT JOIN academic.classes c ON c.section_id = sec.id AND c.academic_year_id = se.academic_year_id
  LEFT JOIN academic.grades g ON g.id = c.grade_id
  LEFT JOIN academic.academicyears ay ON ay.id = se.academic_year_id
`;

export const getStudentStats = async (schoolId) => {
  const result = await query(
    `SELECT
       COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS total,
       COUNT(*) FILTER (WHERE deleted_at IS NULL AND lifecycle_status = 'active')::int AS active,
       COUNT(*) FILTER (WHERE lifecycle_status = 'archived')::int AS archived,
       COUNT(*) FILTER (WHERE gender = 'male' AND deleted_at IS NULL)::int AS male,
       COUNT(*) FILTER (WHERE gender = 'female' AND deleted_at IS NULL)::int AS female,
       COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW()) AND deleted_at IS NULL)::int AS new_this_month
     FROM student.students WHERE school_id = $1`,
    [schoolId]
  );
  return result.rows[0];
};

export const listStudents = async (schoolId, queryParams) => {
  const { page, limit, offset } = getPaginationParams(queryParams);
  const { conditions, params, idx } = buildListFilters(schoolId, queryParams);
  const where = conditions.join(' AND ');
  const sortCol = SORT_COLUMNS[queryParams.sort] || SORT_COLUMNS.name;
  const order = queryParams.order === 'desc' ? 'DESC' : 'ASC';

  const [rows, countResult] = await Promise.all([
    query(
      `SELECT 
         s.id, s.admission_number, s.first_name, s.last_name, s.gender, s.date_of_birth,
         s.lifecycle_status, s.created_at, s.archived_at,
         u.email, u.status AS account_status,
         se.section_id, sec.name AS section_name,
         c.name AS class_name, g.name AS grade_name, g.id AS grade_id,
         ay.name AS academic_year, ay.id AS academic_year_id,
         se.enrolled_at
       ${listFromClause}
       WHERE ${where}
       ORDER BY ${sortCol} ${order} NULLS LAST
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    ),
    query(
      `SELECT COUNT(DISTINCT s.id) ${listFromClause} WHERE ${where}`,
      params
    ),
  ]);

  return { rows: rows.rows, total: parseInt(countResult.rows[0].count, 10), page, limit };
};

export const getStudentProfile = async (schoolId, studentId) => {
  const base = await query(
    `SELECT 
       s.*, u.email, u.status AS account_status, u.id AS user_id
     FROM student.students s
     JOIN identity.users u ON s.user_id = u.id
     WHERE s.school_id = $1 AND s.id = $2 AND s.deleted_at IS NULL`,
    [schoolId, studentId]
  );
  if (!base.rows[0]) throw new AppError('Student not found', 404, ERROR_CODES.NOT_FOUND);

  const [enrollments, guardians, notes, documents, tags, activity, attendance, exams] = await Promise.all([
    query(
      `SELECT se.*, sec.name AS section_name, ay.name AS academic_year, g.name AS grade_name
       FROM student.studentenrollments se
       LEFT JOIN academic.sections sec ON sec.id = se.section_id
       LEFT JOIN academic.academicyears ay ON ay.id = se.academic_year_id
       LEFT JOIN academic.classes c ON c.section_id = se.section_id AND c.academic_year_id = se.academic_year_id
       LEFT JOIN academic.grades g ON g.id = c.grade_id
       WHERE se.student_id = $1 ORDER BY se.enrolled_at DESC`,
      [studentId]
    ).catch(() => ({ rows: [] })),
    query(`SELECT * FROM student.student_guardians WHERE student_id = $1 ORDER BY is_primary DESC`, [studentId]).catch(() => ({ rows: [] })),
    query(
      `SELECT n.*, u.first_name AS author_first_name, u.last_name AS author_last_name
       FROM student.student_notes n
       LEFT JOIN identity.users u ON u.id = n.author_id
       WHERE n.student_id = $1 ORDER BY n.is_pinned DESC, n.created_at DESC`,
      [studentId]
    ).catch(() => ({ rows: [] })),
    query(`SELECT * FROM student.student_documents WHERE student_id = $1 ORDER BY created_at DESC`, [studentId]).catch(() => ({ rows: [] })),
    query(
      `SELECT t.id, t.name, t.color FROM student.student_tags t
       JOIN student.student_tag_map m ON m.tag_id = t.id WHERE m.student_id = $1`,
      [studentId]
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT al.*, u.first_name, u.last_name FROM student.student_activity_logs al
       LEFT JOIN identity.users u ON u.id = al.actor_id
       WHERE al.student_id = $1 ORDER BY al.created_at DESC LIMIT 50`,
      [studentId]
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT status, COUNT(*)::int AS count FROM academic.attendance
       WHERE student_id = $1 GROUP BY status`,
      [studentId]
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT AVG(er.score)::numeric(5,2) AS avg_score, COUNT(*)::int AS exam_count
       FROM operations.examresults er WHERE er.student_id = $1`,
      [studentId]
    ).catch(() => ({ rows: [{ avg_score: null, exam_count: 0 }] })),
  ]);

  const active = enrollments.rows.find((e) => e.status === 'active') || enrollments.rows[0];

  return {
    ...base.rows[0],
    active_enrollment: active,
    enrollments: enrollments.rows,
    guardians: guardians.rows,
    notes: notes.rows,
    documents: documents.rows,
    tags: tags.rows,
    activity: activity.rows,
    attendance_summary: attendance.rows,
    exam_summary: exams.rows[0],
  };
};

export const getStudentById = async (schoolId, studentId) => getStudentProfile(schoolId, studentId);

export const registerAndEnrollStudent = async (data, schoolId, actorId) => {
  const {
    email, password, first_name, last_name, gender,
    date_of_birth, admission_number, section_id, academic_year_id,
    phone, address, nationality, emergency_contact_name, emergency_contact_phone,
    guardians,
  } = data;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const cap = await client.query(
      `SELECT c.capacity, COUNT(e.id)::int AS current_enrollment
       FROM academic.classes c
       LEFT JOIN student.studentenrollments e 
         ON c.section_id = e.section_id AND c.academic_year_id = e.academic_year_id
       WHERE c.section_id = $1 AND c.academic_year_id = $2 AND c.school_id = $3
       GROUP BY c.capacity`,
      [section_id, academic_year_id, schoolId]
    );
    if (!cap.rows[0]) throw new AppError('Class not activated for this academic year.', 400, ERROR_CODES.NOT_FOUND);
    if (cap.rows[0].current_enrollment >= cap.rows[0].capacity) {
      throw new AppError(`Classroom full: capacity of ${cap.rows[0].capacity} reached.`, 400, ERROR_CODES.CAPACITY_EXCEEDED);
    }

    const hashedPw = await hashPassword(password || 'Student123!');
    const userRes = await client.query(
      `INSERT INTO identity.users (email, password_hash, school_id, first_name, last_name, status)
       VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
      [email, hashedPw, schoolId, first_name, last_name]
    );
    const userId = userRes.rows[0].id;
    await client.query(
      `INSERT INTO identity.userroles (user_id, role_id)
       SELECT $1, id FROM identity.roles WHERE name = 'STUDENT' LIMIT 1`,
      [userId]
    );

    const studentRes = await client.query(
      `INSERT INTO student.students (
         school_id, user_id, admission_number, first_name, last_name, gender, date_of_birth,
         phone, address, nationality, emergency_contact_name, emergency_contact_phone, lifecycle_status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active') RETURNING id`,
      [schoolId, userId, admission_number, first_name, last_name, gender, date_of_birth,
        phone, address, nationality, emergency_contact_name, emergency_contact_phone]
    );
    const studentId = studentRes.rows[0].id;

    const enrollRes = await client.query(
      `INSERT INTO student.studentenrollments (school_id, student_id, section_id, academic_year_id, status)
       VALUES ($1, $2, $3, $4, 'active') RETURNING id`,
      [schoolId, studentId, section_id, academic_year_id]
    );

    if (guardians?.length) {
      for (const g of guardians) {
        await client.query(
          `INSERT INTO student.student_guardians (school_id, student_id, full_name, relationship, email, phone, is_primary)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [schoolId, studentId, g.full_name, g.relationship, g.email, g.phone, g.is_primary || false]
        );
      }
    }

    await client.query('COMMIT');
    audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.ENROLL, entity: 'student', entityId: studentId });
    logStudentActivity({ schoolId, studentId, actorId, action: 'ENROLLED', meta: { section_id, academic_year_id } });

    return {
      student_id: studentId,
      user_id: userId,
      enrollment_id: enrollRes.rows[0].id,
      seats_remaining: cap.rows[0].capacity - cap.rows[0].current_enrollment - 1,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') throw new AppError('Email or admission number already exists.', 409, ERROR_CODES.DUPLICATE_ENTRY);
    throw err;
  } finally {
    client.release();
  }
};

export const updateStudent = async (schoolId, studentId, data, actorId) => {
  const allowed = [
    'first_name', 'last_name', 'gender', 'date_of_birth', 'admission_number',
    'phone', 'address', 'nationality', 'blood_group',
    'emergency_contact_name', 'emergency_contact_phone', 'lifecycle_status',
  ];
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

  params.push(schoolId, studentId);
  const result = await query(
    `UPDATE student.students SET ${fields.join(', ')}, updated_at = NOW()
     WHERE school_id = $${idx++} AND id = $${idx} AND deleted_at IS NULL RETURNING id`,
    params
  );
  if (!result.rows[0]) throw new AppError('Student not found.', 404, ERROR_CODES.NOT_FOUND);

  audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.UPDATE, entity: 'student', entityId: studentId });
  logStudentActivity({ schoolId, studentId, actorId, action: 'UPDATED', meta: data });
  return result.rows[0];
};

export const archiveStudent = async (schoolId, studentId, actorId) => {
  const result = await query(
    `UPDATE student.students SET lifecycle_status = 'archived', archived_at = NOW(), updated_at = NOW()
     WHERE school_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING id`,
    [schoolId, studentId]
  );
  if (!result.rows[0]) throw new AppError('Student not found.', 404, ERROR_CODES.NOT_FOUND);
  logStudentActivity({ schoolId, studentId, actorId, action: 'ARCHIVED' });
  return result.rows[0];
};

export const restoreStudent = async (schoolId, studentId, actorId) => {
  const result = await query(
    `UPDATE student.students SET lifecycle_status = 'active', archived_at = NULL, updated_at = NOW()
     WHERE school_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING id`,
    [schoolId, studentId]
  );
  if (!result.rows[0]) throw new AppError('Student not found.', 404, ERROR_CODES.NOT_FOUND);
  logStudentActivity({ schoolId, studentId, actorId, action: 'RESTORED' });
  return result.rows[0];
};

export const softDeleteStudent = async (schoolId, studentId, actorId) => {
  const result = await query(
    `UPDATE student.students SET deleted_at = NOW(), lifecycle_status = 'deleted', updated_at = NOW()
     WHERE school_id = $1 AND id = $2 RETURNING id`,
    [schoolId, studentId]
  );
  if (!result.rows[0]) throw new AppError('Student not found.', 404, ERROR_CODES.NOT_FOUND);
  logStudentActivity({ schoolId, studentId, actorId, action: 'SOFT_DELETED' });
  return result.rows[0];
};

export const bulkStudentAction = async (schoolId, { ids, action }, actorId) => {
  if (!ids?.length) throw new AppError('No students selected.', 400, ERROR_CODES.VALIDATION_ERROR);

  const map = {
    archive: `lifecycle_status = 'archived', archived_at = NOW()`,
    restore: `lifecycle_status = 'active', archived_at = NULL`,
    activate: `lifecycle_status = 'active'`,
    suspend: `lifecycle_status = 'suspended'`,
  };
  const setClause = map[action];
  if (!setClause) throw new AppError('Invalid bulk action.', 400, ERROR_CODES.VALIDATION_ERROR);

  await query(
    `UPDATE student.students SET ${setClause}, updated_at = NOW()
     WHERE school_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL`,
    [schoolId, ids]
  );
  for (const id of ids) {
    logStudentActivity({ schoolId, studentId: id, actorId, action: `BULK_${action.toUpperCase()}` });
  }
  return { updated: ids.length };
};

export const addStudentNote = async (schoolId, studentId, { body, is_pinned }, actorId) => {
  const result = await query(
    `INSERT INTO student.student_notes (school_id, student_id, author_id, body, is_pinned)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [schoolId, studentId, actorId, body, is_pinned || false]
  );
  logStudentActivity({ schoolId, studentId, actorId, action: 'NOTE_ADDED' });
  return result.rows[0];
};

export const addStudentGuardian = async (schoolId, studentId, data, actorId) => {
  const result = await query(
    `INSERT INTO student.student_guardians (school_id, student_id, full_name, relationship, email, phone, is_primary)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [schoolId, studentId, data.full_name, data.relationship, data.email, data.phone, data.is_primary || false]
  );
  logStudentActivity({ schoolId, studentId, actorId, action: 'GUARDIAN_ADDED' });
  return result.rows[0];
};

export const importStudents = async (schoolId, rows, actorId) => {
  if (!rows?.length) throw new AppError('No rows to import.', 400, ERROR_CODES.VALIDATION_ERROR);

  const results = { imported: 0, failed: [] };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      await registerAndEnrollStudent(
        {
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
          admission_number: row.admission_number,
          academic_year_id: row.academic_year_id,
          section_id: row.section_id,
          grade_id: row.grade_id,
          gender: row.gender,
          password: row.password,
        },
        schoolId,
        actorId
      );
      results.imported += 1;
    } catch (err) {
      results.failed.push({ row: i + 2, message: err.message || 'Import failed' });
    }
  }
  return results;
};

export const listSchoolTags = async (schoolId) => {
  const result = await query(
    `SELECT id, name, color FROM student.student_tags WHERE school_id = $1 ORDER BY name`,
    [schoolId]
  ).catch(() => ({ rows: [] }));
  return result.rows;
};

export const createSchoolTag = async (schoolId, { name, color }, actorId) => {
  const result = await query(
    `INSERT INTO student.student_tags (school_id, name, color)
     VALUES ($1, $2, $3)
     ON CONFLICT (school_id, name) DO UPDATE SET color = EXCLUDED.color
     RETURNING *`,
    [schoolId, name, color || '#059669']
  );
  return result.rows[0];
};

export const assignStudentTag = async (schoolId, studentId, tagId, actorId) => {
  await query(
    `SELECT id FROM student.students WHERE id = $1 AND school_id = $2`,
    [studentId, schoolId]
  ).then((r) => {
    if (!r.rows[0]) throw new AppError('Student not found.', 404, ERROR_CODES.NOT_FOUND);
  });
  await query(
    `INSERT INTO student.student_tag_map (student_id, tag_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [studentId, tagId]
  );
  logStudentActivity({ schoolId, studentId, actorId, action: 'TAG_ASSIGNED', meta: { tagId } });
  return { student_id: studentId, tag_id: tagId };
};

export const removeStudentTag = async (schoolId, studentId, tagId, actorId) => {
  await query(
    `DELETE FROM student.student_tag_map WHERE student_id = $1 AND tag_id = $2`,
    [studentId, tagId]
  );
  logStudentActivity({ schoolId, studentId, actorId, action: 'TAG_REMOVED', meta: { tagId } });
  return { removed: true };
};

export const addStudentDocument = async (schoolId, studentId, data, actorId) => {
  const { title, file_url, doc_type, mime_type } = data;
  if (!title?.trim() || !file_url?.trim()) {
    throw new AppError('Title and file are required.', 400, ERROR_CODES.VALIDATION_ERROR);
  }
  const result = await query(
    `INSERT INTO student.student_documents (school_id, student_id, title, file_url, doc_type, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [schoolId, studentId, title.trim(), file_url.trim(), doc_type || 'general', actorId]
  ).catch((err) => {
    if (err.code === '42P01') throw new AppError('Documents table not migrated. Run latest DB migration.', 500);
    throw err;
  });
  logStudentActivity({ schoolId, studentId, actorId, action: 'DOCUMENT_ADDED', meta: { title } });
  return result.rows[0];
};

export const exportStudentsCsv = async (schoolId, queryParams) => {
  const { rows } = await listStudents(schoolId, { ...queryParams, page: 1, limit: 10000 });
  const header = 'admission_number,first_name,last_name,email,gender,grade,section,status,academic_year\n';
  const lines = rows.map((r) =>
    [r.admission_number, r.first_name, r.last_name, r.email, r.gender, r.grade_name, r.section_name,
      r.lifecycle_status || r.account_status, r.academic_year]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
  );
  return header + lines.join('\n');
};
