import bcrypt from 'bcryptjs';
import { query, getClient } from '../../config/db.js';
import { AppError } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';

export const ensureFinanceRole = async (client) => {
  await client.query(
    `INSERT INTO identity.roles (name, school_id)
     SELECT 'FINANCE', NULL
     WHERE NOT EXISTS (
       SELECT 1 FROM identity.roles WHERE name = 'FINANCE' AND school_id IS NULL
     )`
  );
};

export const createFinanceOfficer = async (schoolId, data, actorId) => {
  const email = String(data.email || '').trim().toLowerCase();
  if (!email) throw new AppError('Email is required', 400);

  const client = await getClient();
  try {
    await client.query('BEGIN');
    await ensureFinanceRole(client);

    const dup = await client.query(`SELECT id FROM identity.users WHERE lower(email) = $1`, [email]);
    if (dup.rows[0]) throw new AppError('Email already registered', 409);

    const hash = await bcrypt.hash(data.password, 12);
    const userRes = await client.query(
      `INSERT INTO identity.users (email, password_hash, school_id, first_name, last_name, status)
       VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id, email, first_name, last_name`,
      [email, hash, schoolId, data.first_name, data.last_name]
    );

    await client.query(
      `INSERT INTO identity.userroles (user_id, role_id)
       SELECT $1, id FROM identity.roles WHERE name = 'FINANCE' AND school_id IS NULL LIMIT 1`,
      [userRes.rows[0].id]
    );

    audit({
      userId: actorId,
      schoolId,
      action: 'CREATE',
      entity: 'finance_officer',
      entityId: userRes.rows[0].id,
    });

    await client.query('COMMIT');
    return userRes.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

export const listFinanceOfficers = async (schoolId) => {
  const res = await query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.status, u.created_at
     FROM identity.users u
     JOIN identity.userroles ur ON ur.user_id = u.id
     JOIN identity.roles r ON r.id = ur.role_id
     WHERE u.school_id = $1 AND r.name = 'FINANCE'
     ORDER BY u.last_name`,
    [schoolId]
  );
  return res.rows;
};
