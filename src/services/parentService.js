import { getClient, query } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { hashPassword } from '../utils/auth.js';
import { audit, AUDIT_ACTIONS } from '../utils/audit.js';

export const listParents = async (schoolId, { search, page = 1, limit = 20 }) => {
  const offset = (page - 1) * limit;
  const params = [schoolId];
  let filter = '';
  if (search) {
    params.push(`%${search}%`);
    filter = ` AND (p.first_name ILIKE $2 OR p.last_name ILIKE $2 OR p.email ILIKE $2 OR p.phone ILIKE $2)`;
  }
  const [rows, count] = await Promise.all([
    query(
      `SELECT p.id, p.first_name, p.last_name, p.email, p.phone, p.relationship,
              COUNT(ps.student_id)::int AS linked_students
       FROM academic.parents p
       LEFT JOIN academic.parentstudents ps ON ps.parent_id = p.id
       WHERE p.school_id = $1 ${filter}
       GROUP BY p.id ORDER BY p.last_name, p.first_name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*)::int AS c FROM academic.parents p WHERE p.school_id = $1 ${filter}`, params),
  ]);
  return { rows: rows.rows, total: count.rows[0].c, page, limit };
};

export const registerParent = async (schoolId, data, actorId) => {
  const { first_name, last_name, email, phone, password, relationship, student_ids = [] } = data;
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const roleRes = await client.query(
      `INSERT INTO identity.roles (name, school_id) VALUES ('PARENT', $1)
       ON CONFLICT (name, school_id) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [schoolId]
    );
    const roleId = roleRes.rows[0].id;

    const hashedPw = await hashPassword(password || 'Parent123!');
    const userRes = await client.query(
      `INSERT INTO identity.users (phone, email, password_hash, school_id, first_name, last_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       ON CONFLICT (phone) DO UPDATE SET email = COALESCE(EXCLUDED.email, identity.users.email), updated_at = NOW()
       RETURNING id`,
      [phone, email || null, hashedPw, schoolId, first_name, last_name]
    );
    const userId = userRes.rows[0].id;

    await client.query(
      `INSERT INTO identity.userroles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, roleId]
    );

    const parentRes = await client.query(
      `INSERT INTO academic.parents (school_id, user_id, first_name, last_name, email, phone, relationship)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, school_id) DO UPDATE SET relationship = EXCLUDED.relationship
       RETURNING id`,
      [schoolId, userId, first_name, last_name, email, phone, relationship]
    );
    const parentId = parentRes.rows[0].id;

    let links = 0;
    for (const studentId of student_ids) {
      const ok = await client.query(
        `SELECT id FROM student.students WHERE id = $1 AND school_id = $2`,
        [studentId, schoolId]
      );
      if (!ok.rows[0]) continue;
      await client.query(
        `INSERT INTO academic.parentstudents (school_id, parent_id, student_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [schoolId, parentId, studentId]
      );
      await client.query(
        `INSERT INTO student.student_guardians (school_id, student_id, full_name, relationship, email, phone, is_primary)
         SELECT $1,$2,$3,$4,$5,$6,false
         WHERE NOT EXISTS (
           SELECT 1 FROM student.student_guardians g
           WHERE g.student_id = $2 AND g.phone = $6 AND g.school_id = $1
         )`,
        [schoolId, studentId, `${first_name} ${last_name}`, relationship, email, phone]
      ).catch(() => {});
      links++;
    }

    await client.query('COMMIT');
    audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.CREATE, entity: 'parent', entityId: parentId });
    return { parent_id: parentId, user_id: userId, links_created: links };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') throw new AppError('Parent phone already registered.', 409, ERROR_CODES.DUPLICATE_ENTRY);
    throw err;
  } finally {
    client.release();
  }
};

export const getStudentParents = async (schoolId, studentId) => {
  const result = await query(
    `SELECT p.id, p.first_name, p.last_name, p.email, p.phone, p.relationship
     FROM academic.parentstudents ps
     JOIN academic.parents p ON p.id = ps.parent_id
     WHERE ps.student_id = $1 AND ps.school_id = $2`,
    [studentId, schoolId]
  );
  return result.rows;
};
