import { query, getClient } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { audit, AUDIT_ACTIONS } from '../utils/audit.js';

export const getSchoolSettings = async (schoolId) => {
  const result = await query(
    `SELECT 
       s.id, s.name, s.school_address, s.status,
       ss.phone, ss.email, ss.logo_url, ss.timezone, ss.academic_year_format,
       ss.allow_student_self_register, ss.max_students_per_class
     FROM tenancy.schools s
     LEFT JOIN tenancy.school_settings ss ON ss.school_id = s.id
     WHERE s.id = $1`,
    [schoolId]
  );

  if (!result.rows[0]) throw new AppError('School not found', 404, ERROR_CODES.NOT_FOUND);
  return result.rows[0];
};

export const updateSchoolSettings = async (schoolId, data, actorId) => {
  const db = await getClient();

  try {
    await db.query('BEGIN');

    // Update school name/address if provided
    const schoolFields = [];
    const schoolParams = [];
    let idx = 1;

    if (data.name !== undefined) { schoolFields.push(`name = $${idx++}`); schoolParams.push(data.name); }
    if (data.school_address !== undefined) { schoolFields.push(`school_address = $${idx++}`); schoolParams.push(data.school_address); }

    if (schoolFields.length) {
      schoolParams.push(schoolId);
      await db.query(
        `UPDATE tenancy.schools SET ${schoolFields.join(', ')} WHERE id = $${idx}`,
        schoolParams
      );
    }

    // Upsert school_settings
    const settingsFields = ['phone', 'email', 'logo_url', 'timezone', 'academic_year_format', 'allow_student_self_register', 'max_students_per_class'];
    const settingsData = {};
    for (const f of settingsFields) {
      if (data[f] !== undefined) settingsData[f] = data[f];
    }

    if (Object.keys(settingsData).length) {
      const cols = Object.keys(settingsData);
      const vals = Object.values(settingsData);
      const setClauses = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');

      await db.query(
        `INSERT INTO tenancy.school_settings (school_id, ${cols.join(', ')})
         VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')})
         ON CONFLICT (school_id) DO UPDATE SET ${setClauses}`,
        [schoolId, ...vals]
      );
    }

    await db.query('COMMIT');

    audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.UPDATE, entity: 'school_settings', entityId: schoolId });

    return getSchoolSettings(schoolId);
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
};

export const listGradeScales = async (schoolId) => {
  const result = await query(
    `SELECT id, name, min_score, max_score, grade_letter, gpa_points, description
     FROM academic.grade_scales
     WHERE school_id = $1
     ORDER BY min_score DESC`,
    [schoolId]
  );
  return result.rows;
};

export const createGradeScale = async (schoolId, data, actorId) => {
  const { name, min_score, max_score, grade_letter, gpa_points, description } = data;

  const result = await query(
    `INSERT INTO academic.grade_scales (school_id, name, min_score, max_score, grade_letter, gpa_points, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [schoolId, name, min_score, max_score, grade_letter, gpa_points, description]
  );

  audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.CREATE, entity: 'grade_scale', entityId: result.rows[0].id });
  return result.rows[0];
};

export const deleteGradeScale = async (schoolId, scaleId, actorId) => {
  const result = await query(
    `DELETE FROM academic.grade_scales WHERE school_id = $1 AND id = $2 RETURNING id`,
    [schoolId, scaleId]
  );
  if (!result.rows[0]) throw new AppError('Grade scale not found.', 404, ERROR_CODES.NOT_FOUND);
  audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.DELETE, entity: 'grade_scale', entityId: scaleId });
};

export const listUsers = async (schoolId, queryParams) => {
  const { page, limit, offset } = (await import('../utils/pagination.js')).getPaginationParams(queryParams);
  const { search, role } = queryParams;

  const conditions = ['u.school_id = $1'];
  const params = [schoolId];
  let idx = 2;

  if (search) {
    conditions.push(`(u.first_name ILIKE $${idx} OR u.last_name ILIKE $${idx} OR u.email ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }
  if (role) {
    conditions.push(`r.name = $${idx++}`);
    params.push(role);
  }

  const where = conditions.join(' AND ');

  const [rows, countResult] = await Promise.all([
    query(
      `SELECT 
         u.id, u.email, u.first_name, u.last_name, u.status, u.created_at,
         array_agg(DISTINCT r.name) as roles
       FROM identity.users u
       LEFT JOIN identity.userroles ur ON ur.user_id = u.id
       LEFT JOIN identity.roles r ON r.id = ur.role_id
       WHERE ${where}
       GROUP BY u.id, u.email, u.first_name, u.last_name, u.status, u.created_at
       ORDER BY u.last_name, u.first_name
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    ),
    query(
      `SELECT COUNT(DISTINCT u.id) FROM identity.users u
       LEFT JOIN identity.userroles ur ON ur.user_id = u.id
       LEFT JOIN identity.roles r ON r.id = ur.role_id
       WHERE ${where}`,
      params
    ),
  ]);

  return { rows: rows.rows, total: parseInt(countResult.rows[0].count), page, limit };
};

export const toggleUserStatus = async (schoolId, userId, actorId) => {
  const result = await query(
    `UPDATE identity.users 
     SET status = CASE WHEN status = 'active' THEN 'inactive' ELSE 'active' END
     WHERE school_id = $1 AND id = $2
     RETURNING id, status`,
    [schoolId, userId]
  );
  if (!result.rows[0]) throw new AppError('User not found.', 404, ERROR_CODES.NOT_FOUND);
  audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.UPDATE, entity: 'user', entityId: userId, meta: { status: result.rows[0].status } });
  return result.rows[0];
};
