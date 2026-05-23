import { getClient, query } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { hashPassword, comparePasswords } from '../utils/auth.js';
import { audit, AUDIT_ACTIONS } from '../utils/audit.js';

const parseName = (first, last) => ({
  first_name: (first || '').trim() || 'Parent',
  last_name: (last || '').trim(),
});

/** Keep student.guardians in sync when a portal parent is linked */
const ensureGuardianForPortalParent = async (client, schoolId, studentId, parent) => {
  if (!parent.phone?.trim()) return;
  const phone = parent.phone.trim();
  const { first_name, last_name } = parseName(parent.first_name, parent.last_name);

  const existing = await client.query(
    `SELECT g.id FROM student.guardians g
     WHERE g.school_id = $1 AND g.phone_primary = $2 AND COALESCE(g.is_deleted, false) = false
     LIMIT 1`,
    [schoolId, phone]
  );

  let guardianId = existing.rows[0]?.id;
  if (!guardianId) {
    const ins = await client.query(
      `INSERT INTO student.guardians (school_id, first_name, last_name, relationship, phone_primary, email)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [schoolId, first_name, last_name, parent.relationship || 'parent', phone, parent.email || null]
    );
    guardianId = ins.rows[0].id;
  } else {
    await client.query(
      `UPDATE student.guardians SET
         first_name = $3, last_name = $4, relationship = COALESCE($5, relationship),
         email = COALESCE($6, email), updated_at = NOW()
       WHERE id = $1 AND school_id = $2`,
      [guardianId, schoolId, first_name, last_name, parent.relationship, parent.email]
    );
  }

  await client.query(
    `INSERT INTO student.guardian_links (student_id, guardian_id, is_primary, is_emergency, can_pickup)
     VALUES ($1,$2,false,false,true) ON CONFLICT (student_id, guardian_id) DO NOTHING`,
    [studentId, guardianId]
  );
};

export const listParents = async (schoolId, { search, page = 1, limit = 20 }) => {
  const offset = (page - 1) * limit;
  const params = [schoolId];
  let searchFilterPortal = '';
  let searchFilterGuardian = '';
  if (search) {
    params.push(`%${search}%`);
    const idx = params.length;
    searchFilterPortal = ` AND (p.first_name ILIKE $${idx} OR p.last_name ILIKE $${idx} OR p.email ILIKE $${idx} OR p.phone ILIKE $${idx})`;
    searchFilterGuardian = ` AND (g.first_name ILIKE $${idx} OR g.last_name ILIKE $${idx} OR g.email ILIKE $${idx} OR g.phone_primary ILIKE $${idx})`;
  }

  const baseSql = `
    SELECT * FROM (
      SELECT p.id, p.user_id, p.first_name, p.last_name, p.email, p.phone, p.relationship,
             COUNT(ps.student_id)::int AS linked_students,
             'portal' AS record_type
      FROM academic.parents p
      LEFT JOIN academic.parentstudents ps ON ps.parent_id = p.id
      WHERE p.school_id = $1 ${searchFilterPortal}
      GROUP BY p.id

      UNION ALL

      SELECT g.id, NULL::uuid AS user_id, g.first_name, g.last_name, g.email, g.phone_primary AS phone, g.relationship,
             COUNT(gl.student_id)::int AS linked_students,
             'guardian' AS record_type
      FROM student.guardians g
      LEFT JOIN student.guardian_links gl ON gl.guardian_id = g.id
      WHERE g.school_id = $1 AND COALESCE(g.is_deleted, false) = false ${searchFilterGuardian}
      GROUP BY g.id
    ) combined`;

  const [rows, count] = await Promise.all([
    query(
      `${baseSql} ORDER BY last_name, first_name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*)::int AS c FROM (${baseSql}) combined`, params),
  ]);
  return { rows: rows.rows, total: count.rows[0].c, page, limit };
};

export const getParentById = async (schoolId, parentId) => {
  const parent = await query(
    `SELECT p.*, u.email AS login_email, u.status AS account_status
     FROM academic.parents p
     JOIN identity.users u ON u.id = p.user_id
     WHERE p.id = $1 AND p.school_id = $2`,
    [parentId, schoolId]
  );
  if (!parent.rows[0]) throw new AppError('Parent not found.', 404, ERROR_CODES.NOT_FOUND);

  const students = await query(
    `SELECT s.id, s.first_name, s.last_name, s.admission_number,
            g.name AS grade_name, sec.name AS section_name
     FROM academic.parentstudents ps
     JOIN student.students s ON s.id = ps.student_id AND s.deleted_at IS NULL
     LEFT JOIN student.studentenrollments se ON se.student_id = s.id AND se.status = 'active'
     LEFT JOIN academic.sections sec ON sec.id = se.section_id
     LEFT JOIN academic.grades g ON g.id = sec.grade_id
     WHERE ps.parent_id = $1 AND ps.school_id = $2
     ORDER BY s.last_name, s.first_name`,
    [parentId, schoolId]
  );

  return { ...parent.rows[0], students: students.rows };
};

export const registerParent = async (schoolId, data, actorId) => {
  const { first_name, last_name, email, phone, password, relationship, student_ids = [] } = data;
  const loginEmail = String(email || '').trim().toLowerCase();
  if (!loginEmail) {
    throw new AppError('Email is required — parents sign in with email and password.', 400, ERROR_CODES.VALIDATION_ERROR);
  }
  if (!phone?.trim()) {
    throw new AppError('Phone is required.', 400, ERROR_CODES.VALIDATION_ERROR);
  }
  if (!password || String(password).length < 6) {
    throw new AppError('Password is required (minimum 6 characters).', 400, ERROR_CODES.VALIDATION_ERROR);
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const roleRes = await client.query(
      `INSERT INTO identity.roles (name, school_id) VALUES ('PARENT', $1)
       ON CONFLICT (name, school_id) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [schoolId]
    );
    const roleId = roleRes.rows[0].id;

    const hashedPw = await hashPassword(password);
    const userRes = await client.query(
      `INSERT INTO identity.users (phone, email, password_hash, school_id, first_name, last_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       ON CONFLICT (phone) DO UPDATE SET
         email = EXCLUDED.email,
         password_hash = EXCLUDED.password_hash,
         school_id = EXCLUDED.school_id,
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         updated_at = NOW()
       RETURNING id`,
      [phone.trim(), loginEmail, hashedPw, schoolId, first_name, last_name]
    );
    const userId = userRes.rows[0].id;

    await client.query(
      `INSERT INTO identity.userroles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, roleId]
    );

    const parentRes = await client.query(
      `INSERT INTO academic.parents (school_id, user_id, first_name, last_name, email, phone, relationship)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, school_id) DO UPDATE SET
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         email = EXCLUDED.email,
         phone = EXCLUDED.phone,
         relationship = EXCLUDED.relationship
       RETURNING id`,
      [schoolId, userId, first_name, last_name, loginEmail, phone.trim(), relationship || 'parent']
    );
    const parentId = parentRes.rows[0].id;
    const parentRow = { first_name, last_name, email: loginEmail, phone: phone.trim(), relationship: relationship || 'parent' };

    let links = 0;
    for (const studentId of student_ids) {
      const ok = await client.query(
        `SELECT id FROM student.students WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL`,
        [studentId, schoolId]
      );
      if (!ok.rows[0]) continue;
      await client.query(
        `INSERT INTO academic.parentstudents (school_id, parent_id, student_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [schoolId, parentId, studentId]
      );
      await ensureGuardianForPortalParent(client, schoolId, studentId, parentRow);
      links++;
    }

    await client.query('COMMIT');
    audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.CREATE, entity: 'parent', entityId: parentId });
    return { parent_id: parentId, user_id: userId, links_created: links, login_email: loginEmail };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') throw new AppError('Phone or email already registered.', 409, ERROR_CODES.DUPLICATE_ENTRY);
    throw err;
  } finally {
    client.release();
  }
};

export const updateParent = async (schoolId, parentId, data, actorId) => {
  const existing = await getParentById(schoolId, parentId);
  const loginEmail = data.email != null ? String(data.email).trim().toLowerCase() : existing.login_email;
  if (!loginEmail) throw new AppError('Email is required for portal login.', 400, ERROR_CODES.VALIDATION_ERROR);

  await query(
    `UPDATE academic.parents SET
       first_name = COALESCE($3, first_name),
       last_name = COALESCE($4, last_name),
       email = $5,
       phone = COALESCE($6, phone),
       relationship = COALESCE($7, relationship)
     WHERE id = $1 AND school_id = $2`,
    [parentId, schoolId, data.first_name, data.last_name, loginEmail, data.phone?.trim(), data.relationship]
  );

  await query(
    `UPDATE identity.users SET
       first_name = COALESCE($2, first_name),
       last_name = COALESCE($3, last_name),
       email = $4,
       phone = COALESCE($5, phone),
       updated_at = NOW()
     WHERE id = $1`,
    [existing.user_id, data.first_name, data.last_name, loginEmail, data.phone?.trim()]
  );

  audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.UPDATE, entity: 'parent', entityId: parentId });
  return getParentById(schoolId, parentId);
};

export const setParentPassword = async (schoolId, parentId, password, actorId) => {
  if (!password || String(password).length < 6) {
    throw new AppError('Password must be at least 6 characters.', 400, ERROR_CODES.VALIDATION_ERROR);
  }
  const parent = await query(
    `SELECT user_id FROM academic.parents WHERE id = $1 AND school_id = $2`,
    [parentId, schoolId]
  );
  if (!parent.rows[0]) throw new AppError('Parent not found.', 404, ERROR_CODES.NOT_FOUND);

  const hashedPw = await hashPassword(password);
  await query(
    `UPDATE identity.users SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
    [parent.rows[0].user_id, hashedPw]
  );
  audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.UPDATE, entity: 'parent_password', entityId: parentId });
  return { updated: true };
};

export const searchParents = async (schoolId, q, limit = 20) => {
  if (!q?.trim()) return [];
  const result = await query(
    `SELECT p.id, p.first_name, p.last_name, p.email, p.phone, p.relationship,
            COUNT(ps.student_id)::int AS linked_students
     FROM academic.parents p
     LEFT JOIN academic.parentstudents ps ON ps.parent_id = p.id
     WHERE p.school_id = $1
       AND (p.first_name ILIKE $2 OR p.last_name ILIKE $2 OR p.phone ILIKE $2 OR p.email ILIKE $2)
     GROUP BY p.id
     ORDER BY p.last_name, p.first_name
     LIMIT $3`,
    [schoolId, `%${q.trim()}%`, limit]
  );
  return result.rows;
};

export const searchStudentsForParentLink = async (schoolId, q, limit = 15) => {
  if (!q?.trim()) return [];
  const result = await query(
    `SELECT s.id, s.first_name, s.last_name, s.admission_number, sec.name AS section_name, g.name AS grade_name
     FROM student.students s
     LEFT JOIN student.studentenrollments se ON se.student_id = s.id AND se.status = 'active'
     LEFT JOIN academic.sections sec ON sec.id = se.section_id
     LEFT JOIN academic.grades g ON g.id = sec.grade_id
     WHERE s.school_id = $1 AND s.deleted_at IS NULL
       AND (s.first_name ILIKE $2 OR s.last_name ILIKE $2 OR s.admission_number ILIKE $2)
     ORDER BY s.last_name, s.first_name
     LIMIT $3`,
    [schoolId, `%${q.trim()}%`, limit]
  );
  return result.rows;
};

export const linkParentToStudents = async (schoolId, parentId, studentIds, actorId) => {
  const parent = await query(
    `SELECT id, first_name, last_name, email, phone, relationship FROM academic.parents WHERE id = $1 AND school_id = $2`,
    [parentId, schoolId]
  );
  if (!parent.rows[0]) throw new AppError('Parent not found.', 404, ERROR_CODES.NOT_FOUND);
  const p = parent.rows[0];

  const client = await getClient();
  try {
    await client.query('BEGIN');
    let links = 0;
    for (const studentId of studentIds) {
      const ok = await client.query(
        `SELECT id FROM student.students WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL`,
        [studentId, schoolId]
      );
      if (!ok.rows[0]) continue;
      await client.query(
        `INSERT INTO academic.parentstudents (school_id, parent_id, student_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [schoolId, parentId, studentId]
      );
      await ensureGuardianForPortalParent(client, schoolId, studentId, p);
      links++;
    }
    await client.query('COMMIT');
    audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.UPDATE, entity: 'parent', entityId: parentId, meta: { links } });
    return { links_created: links };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const unlinkParentFromStudent = async (schoolId, parentId, studentId, actorId) => {
  const result = await query(
    `DELETE FROM academic.parentstudents
     WHERE school_id = $1 AND parent_id = $2 AND student_id = $3
     RETURNING student_id`,
    [schoolId, parentId, studentId]
  );
  if (!result.rows[0]) throw new AppError('Link not found.', 404, ERROR_CODES.NOT_FOUND);
  audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.DELETE, entity: 'parent_student_link', entityId: parentId, meta: { studentId } });
  return { unlinked: true };
};

export const getStudentParents = async (schoolId, studentId) => {
  const result = await query(
    `SELECT p.id, p.first_name, p.last_name, p.email, p.phone, p.relationship, p.user_id
     FROM academic.parentstudents ps
     JOIN academic.parents p ON p.id = ps.parent_id
     WHERE ps.student_id = $1 AND ps.school_id = $2`,
    [studentId, schoolId]
  );
  return result.rows;
};

export const linkExistingParentToStudent = async (schoolId, studentId, parentId, actorId) => {
  return linkParentToStudents(schoolId, parentId, [studentId], actorId);
};
