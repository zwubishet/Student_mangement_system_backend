import { query } from '../config/db.js';

/**
 * Write an audit log entry.
 * Non-blocking — errors are swallowed so they never break the main request.
 */
export const audit = async ({ userId, schoolId, action, entity, entityId, meta = {} }) => {
  try {
    await query(
      `INSERT INTO identity.audit_logs (user_id, school_id, action, entity, entity_id, meta, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [userId, schoolId, action, entity, entityId, JSON.stringify(meta)]
    );
  } catch {
    // Audit failures must never break the main flow
  }
};

export const AUDIT_ACTIONS = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  ENROLL: 'ENROLL',
  UNENROLL: 'UNENROLL',
};

/**
 * Transaction-aware audit helper used by finance/files modules.
 * @param {import('pg').PoolClient|null} client - Active PG client (same transaction)
 * @param {{ schoolId: string, userId: string, action: string, entityType: string, entityId?: string, meta?: object }} entry
 */
export const auditLog = async (client, { schoolId, userId, action, entityType, entityId, meta = {} }) => {
  const sql = `INSERT INTO identity.audit_logs (user_id, school_id, action, entity, entity_id, meta, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`;
  const params = [userId, schoolId, action, entityType, entityId ?? null, JSON.stringify(meta)];

  if (client?.query) {
    await client.query(sql, params);
    return;
  }

  await audit({ userId, schoolId, action, entity: entityType, entityId, meta });
};
