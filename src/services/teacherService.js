import { query, getClient } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { hashPassword } from '../utils/auth.js';
import { audit, AUDIT_ACTIONS } from '../utils/audit.js';
import { getPaginationParams } from '../utils/pagination.js';
import { logTeacherActivity } from '../utils/entityActivity.js';

const SORT_COLUMNS = {
  name: 't.last_name',
  email: 't.email',
  hire_date: 't.hire_date',
  created_at: 't.created_at',
  department: 't.department',
};

const buildTeacherFilters = (schoolId, q) => {
  const conditions = ['t.school_id = $1'];
  const params = [schoolId];
  let idx = 2;

  if (q.include_deleted !== 'true') conditions.push('t.deleted_at IS NULL');
  if (q.include_archived !== 'true') conditions.push(`COALESCE(t.status, 'active') != 'archived'`);

  if (q.search) {
    conditions.push(
      `(t.first_name ILIKE $${idx} OR t.last_name ILIKE $${idx} OR t.email ILIKE $${idx})`
    );
    params.push(`%${q.search}%`);
    idx++;
  }
  if (q.status) {
    conditions.push(`COALESCE(t.status, u.status) = $${idx++}`);
    params.push(q.status);
  }
  if (q.department) {
    conditions.push(`t.department = $${idx++}`);
    params.push(q.department);
  }
  if (q.employment_type) {
    conditions.push(`t.employment_type = $${idx++}`);
    params.push(q.employment_type);
  }
  if (q.leave_status) {
    conditions.push(`t.leave_status = $${idx++}`);
    params.push(q.leave_status);
  }
  if (q.subject_id) {
    conditions.push(`EXISTS (
      SELECT 1 FROM academic.teacherassignments ta 
      WHERE ta.teacher_id = t.user_id AND ta.subject_id = $${idx}
    )`);
    params.push(q.subject_id);
    idx++;
  }

  return { conditions, params, idx };
};

export const getTeacherStats = async (schoolId) => {
  const result = await query(
    `SELECT
       COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS total,
       COUNT(*) FILTER (WHERE deleted_at IS NULL AND COALESCE(status,'active') = 'active')::int AS active,
       COUNT(*) FILTER (WHERE status = 'archived')::int AS archived,
       COUNT(*) FILTER (WHERE leave_status = 'on_leave')::int AS on_leave,
       COUNT(*) FILTER (WHERE employment_type = 'full_time')::int AS full_time
     FROM academic.teachers WHERE school_id = $1`,
    [schoolId]
  );
  return result.rows[0];
};

export const listTeachers = async (schoolId, queryParams) => {
  const { page, limit, offset } = getPaginationParams(queryParams);
  const { conditions, params, idx } = buildTeacherFilters(schoolId, queryParams);
  const where = conditions.join(' AND ');
  const sortCol = SORT_COLUMNS[queryParams.sort] || SORT_COLUMNS.name;
  const order = queryParams.order === 'desc' ? 'DESC' : 'ASC';

  const [rows, countResult] = await Promise.all([
    query(
      `SELECT 
         t.id, t.user_id, t.first_name, t.last_name, t.email, t.phone, t.hire_date,
         t.department, t.employment_type, t.leave_status, t.status, t.created_at,
         COALESCE(u.status, t.status) AS account_status,
         COUNT(DISTINCT ta.section_id)::int AS assigned_sections,
         COUNT(DISTINCT ta.subject_id)::int AS assigned_subjects,
         string_agg(DISTINCT sub.name, ', ') AS subject_names
       FROM academic.teachers t
       LEFT JOIN identity.users u ON t.user_id = u.id
       LEFT JOIN academic.teacherassignments ta ON ta.teacher_id = t.user_id
       LEFT JOIN academic.subjects sub ON sub.id = ta.subject_id
       WHERE ${where}
       GROUP BY t.id, t.user_id, t.first_name, t.last_name, t.email, t.phone, t.hire_date,
                t.department, t.employment_type, t.leave_status, t.status, t.created_at, u.status
       ORDER BY ${sortCol} ${order} NULLS LAST
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    ),
    query(
      `SELECT COUNT(DISTINCT t.id) FROM academic.teachers t
       LEFT JOIN identity.users u ON t.user_id = u.id
       LEFT JOIN academic.teacherassignments ta ON ta.teacher_id = t.user_id
       WHERE ${where}`,
      params
    ),
  ]);

  return { rows: rows.rows, total: parseInt(countResult.rows[0].count, 10), page, limit };
};

export const getTeacherProfile = async (schoolId, teacherId) => {
  const base = await query(
    `SELECT t.*, u.email, COALESCE(u.status, t.status) AS account_status
     FROM academic.teachers t
     LEFT JOIN identity.users u ON t.user_id = u.id
     WHERE t.school_id = $1 AND t.id = $2 AND t.deleted_at IS NULL`,
    [schoolId, teacherId]
  );
  if (!base.rows[0]) throw new AppError('Teacher not found', 404, ERROR_CODES.NOT_FOUND);

  const [assignments, qualifications, notes, documents, availability, activity] = await Promise.all([
    query(
      `SELECT ta.id, sec.id AS section_id, sec.name AS section_name,
              sub.id AS subject_id, sub.name AS subject_name, g.name AS grade_name
       FROM academic.teacherassignments ta
       JOIN academic.sections sec ON sec.id = ta.section_id
       JOIN academic.subjects sub ON sub.id = ta.subject_id
       LEFT JOIN academic.grades g ON g.id = sec.grade_id
       WHERE ta.teacher_id = $1`,
      [base.rows[0].user_id]
    ),
    query(`SELECT * FROM academic.teacher_qualifications WHERE teacher_id = $1 ORDER BY year_obtained DESC`, [teacherId]).catch(() => ({ rows: [] })),
    query(
      `SELECT n.*, u.first_name AS author_first_name, u.last_name AS author_last_name
       FROM academic.teacher_notes n LEFT JOIN identity.users u ON u.id = n.author_id
       WHERE n.teacher_id = $1 ORDER BY n.is_pinned DESC, n.created_at DESC`,
      [teacherId]
    ).catch(() => ({ rows: [] })),
    query(`SELECT * FROM academic.teacher_documents WHERE teacher_id = $1 ORDER BY created_at DESC`, [teacherId]).catch(() => ({ rows: [] })),
    query(`SELECT * FROM academic.teacher_availability WHERE teacher_id = $1 ORDER BY day_of_week`, [teacherId]).catch(() => ({ rows: [] })),
    query(
      `SELECT al.*, u.first_name, u.last_name FROM academic.teacher_activity_logs al
       LEFT JOIN identity.users u ON u.id = al.actor_id
       WHERE al.teacher_id = $1 ORDER BY al.created_at DESC LIMIT 50`,
      [teacherId]
    ).catch(() => ({ rows: [] })),
  ]);

  return {
    ...base.rows[0],
    assignments: assignments.rows,
    qualifications: qualifications.rows,
    notes: notes.rows,
    documents: documents.rows,
    availability: availability.rows,
    activity: activity.rows,
    workload: {
      sections: assignments.rows.length,
      subjects: new Set(assignments.rows.map((a) => a.subject_id)).size,
    },
  };
};

export const getTeacherById = async (schoolId, teacherId) => getTeacherProfile(schoolId, teacherId);

export const createTeacher = async (data, schoolId, actorId) => {
  const {
    first_name, last_name, email, phone, hire_date,
    department, employment_type, qualification_summary, address,
  } = data;
  const client = await getClient();

  try {
    await client.query('BEGIN');
    const hashedPw = await hashPassword(data.password || 'Teacher123!');
    const userRes = await client.query(
      `INSERT INTO identity.users (email, first_name, last_name, school_id, status, password_hash)
       VALUES ($1, $2, $3, $4, 'active', $5) RETURNING id`,
      [email, first_name, last_name, schoolId, hashedPw]
    );
    const userId = userRes.rows[0].id;
    await client.query(
      `INSERT INTO identity.userroles (user_id, role_id)
       SELECT $1, id FROM identity.roles WHERE name = 'TEACHER' LIMIT 1`,
      [userId]
    );
    const teacherRes = await client.query(
      `INSERT INTO academic.teachers (
         school_id, user_id, first_name, last_name, email, phone, hire_date,
         department, employment_type, qualification_summary, address, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active') RETURNING id`,
      [schoolId, userId, first_name, last_name, email, phone, hire_date,
        department, employment_type, qualification_summary, address]
    );
    await client.query('COMMIT');

    const teacherId = teacherRes.rows[0].id;
    audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.CREATE, entity: 'teacher', entityId: teacherId });
    logTeacherActivity({ schoolId, teacherId, actorId, action: 'CREATED' });
    return { teacher_id: teacherId, user_id: userId, email };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') throw new AppError('Email already exists.', 409, ERROR_CODES.DUPLICATE_ENTRY);
    throw err;
  } finally {
    client.release();
  }
};

export const updateTeacher = async (schoolId, teacherId, data, actorId) => {
  const allowed = [
    'first_name', 'last_name', 'phone', 'hire_date', 'department',
    'employment_type', 'leave_status', 'qualification_summary', 'address', 'status',
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

  params.push(schoolId, teacherId);
  const result = await query(
    `UPDATE academic.teachers SET ${fields.join(', ')}, updated_at = NOW()
     WHERE school_id = $${idx++} AND id = $${idx} AND deleted_at IS NULL RETURNING id`,
    params
  );
  if (!result.rows[0]) throw new AppError('Teacher not found.', 404, ERROR_CODES.NOT_FOUND);
  logTeacherActivity({ schoolId, teacherId, actorId, action: 'UPDATED', meta: data });
  return result.rows[0];
};

export const archiveTeacher = async (schoolId, teacherId, actorId) => {
  const result = await query(
    `UPDATE academic.teachers SET status = 'archived', archived_at = NOW(), updated_at = NOW()
     WHERE school_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING id`,
    [schoolId, teacherId]
  );
  if (!result.rows[0]) throw new AppError('Teacher not found.', 404, ERROR_CODES.NOT_FOUND);
  logTeacherActivity({ schoolId, teacherId, actorId, action: 'ARCHIVED' });
  return result.rows[0];
};

export const restoreTeacher = async (schoolId, teacherId, actorId) => {
  const result = await query(
    `UPDATE academic.teachers SET status = 'active', archived_at = NULL, updated_at = NOW()
     WHERE school_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING id`,
    [schoolId, teacherId]
  );
  if (!result.rows[0]) throw new AppError('Teacher not found.', 404, ERROR_CODES.NOT_FOUND);
  logTeacherActivity({ schoolId, teacherId, actorId, action: 'RESTORED' });
  return result.rows[0];
};

export const softDeleteTeacher = async (schoolId, teacherId, actorId) => {
  const result = await query(
    `UPDATE academic.teachers SET deleted_at = NOW(), status = 'deleted', updated_at = NOW()
     WHERE school_id = $1 AND id = $2 RETURNING id`,
    [schoolId, teacherId]
  );
  if (!result.rows[0]) throw new AppError('Teacher not found.', 404, ERROR_CODES.NOT_FOUND);
  logTeacherActivity({ schoolId, teacherId, actorId, action: 'SOFT_DELETED' });
  return result.rows[0];
};

export const bulkTeacherAction = async (schoolId, { ids, action }, actorId) => {
  if (!ids?.length) throw new AppError('No teachers selected.', 400, ERROR_CODES.VALIDATION_ERROR);
  const map = {
    archive: `status = 'archived', archived_at = NOW()`,
    restore: `status = 'active', archived_at = NULL`,
    activate: `status = 'active'`,
  };
  const setClause = map[action];
  if (!setClause) throw new AppError('Invalid bulk action.', 400, ERROR_CODES.VALIDATION_ERROR);

  await query(
    `UPDATE academic.teachers SET ${setClause}, updated_at = NOW()
     WHERE school_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL`,
    [schoolId, ids]
  );
  for (const id of ids) logTeacherActivity({ schoolId, teacherId: id, actorId, action: `BULK_${action.toUpperCase()}` });
  return { updated: ids.length };
};

export const addTeacherNote = async (schoolId, teacherId, { body, is_pinned }, actorId) => {
  const result = await query(
    `INSERT INTO academic.teacher_notes (school_id, teacher_id, author_id, body, is_pinned)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [schoolId, teacherId, actorId, body, is_pinned || false]
  );
  logTeacherActivity({ schoolId, teacherId, actorId, action: 'NOTE_ADDED' });
  return result.rows[0];
};

export const addTeacherQualification = async (schoolId, teacherId, data, actorId) => {
  const result = await query(
    `INSERT INTO academic.teacher_qualifications (school_id, teacher_id, title, institution, year_obtained)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [schoolId, teacherId, data.title, data.institution, data.year_obtained]
  );
  logTeacherActivity({ schoolId, teacherId, actorId, action: 'QUALIFICATION_ADDED' });
  return result.rows[0];
};

export const importTeachers = async (schoolId, rows, actorId) => {
  if (!rows?.length) throw new AppError('No rows to import.', 400, ERROR_CODES.VALIDATION_ERROR);

  const results = { imported: 0, failed: [] };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      await createTeacher(
        {
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
          phone: row.phone,
          department: row.department,
          employment_type: row.employment_type || 'full_time',
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

export const exportTeachersCsv = async (schoolId, queryParams) => {
  const { rows } = await listTeachers(schoolId, { ...queryParams, page: 1, limit: 10000 });
  const header = 'first_name,last_name,email,phone,department,employment_type,status,sections\n';
  const lines = rows.map((r) =>
    [r.first_name, r.last_name, r.email, r.phone, r.department, r.employment_type, r.status, r.assigned_sections]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
  );
  return header + lines.join('\n');
};
