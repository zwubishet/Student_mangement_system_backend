import { query, getClient } from '../../config/db.js';
import redisClient from '../../config/redis.js';
import { AppError, ERROR_CODES } from '../../utils/errors.js';
import { PLATFORM_SCHOOL_ID, SCHOOL_STATUSES } from '../../constants/platform.js';
import { registerSchoolAndAdmin } from '../authService.js';

const logPlatformAudit = async (actorId, action, entity, entityId, meta = {}) => {
  await query(
    `INSERT INTO identity.platform_audit_logs (actor_id, action, entity, entity_id, meta)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorId, action, entity, entityId ?? null, JSON.stringify(meta)]
  );
};

export const getPlatformOverview = async () => {
  const [schools, users, subs, recent] = await Promise.all([
    query(
      `SELECT status, COUNT(*)::int AS count
       FROM tenancy.schools
       WHERE id != $1
       GROUP BY status`,
      [PLATFORM_SCHOOL_ID]
    ),
    query(
      `SELECT COUNT(*)::int AS total
       FROM identity.users u
       JOIN tenancy.schools s ON s.id = u.school_id
       WHERE s.id != $1`,
      [PLATFORM_SCHOOL_ID]
    ),
    query(
      `SELECT status, COUNT(*)::int AS count
       FROM tenancy.subscriptions
       GROUP BY status`
    ),
    query(
      `SELECT COUNT(*)::int AS count
       FROM tenancy.schools
       WHERE id != $1 AND created_at >= NOW() - INTERVAL '30 days'`,
      [PLATFORM_SCHOOL_ID]
    ),
  ]);

  const byStatus = Object.fromEntries(schools.rows.map((r) => [r.status, r.count]));
  const totalSchools = schools.rows.reduce((sum, r) => sum + r.count, 0);

  return {
    schools: {
      total: totalSchools,
      active: byStatus.active ?? 0,
      suspended: byStatus.suspended ?? 0,
      inactive: byStatus.inactive ?? 0,
      created_last_30_days: recent.rows[0]?.count ?? 0,
    },
    users: { total: users.rows[0]?.total ?? 0 },
    subscriptions: subs.rows,
  };
};

export const getPlatformHealth = async () => {
  const health = {
    api: 'ok',
    database: 'unknown',
    redis: 'unknown',
    timestamp: new Date().toISOString(),
  };

  try {
    await query('SELECT 1');
    health.database = 'ok';
  } catch {
    health.database = 'error';
  }

  try {
    if (redisClient.isOpen) {
      await redisClient.ping();
      health.redis = 'ok';
    } else {
      health.redis = 'unavailable';
    }
  } catch {
    health.redis = 'error';
  }

  return health;
};

export const listSchools = async ({ search, status, limit = 50, offset = 0 } = {}) => {
  const params = [PLATFORM_SCHOOL_ID];
  let sql = `
    SELECT s.id, s.name, s.school_address, s.domain, s.plan, s.status, s.created_at,
           COUNT(DISTINCT u.id)::int AS user_count,
           COUNT(DISTINCT st.id)::int AS student_count,
           sub.plan AS subscription_plan,
           sub.status AS subscription_status
    FROM tenancy.schools s
    LEFT JOIN identity.users u ON u.school_id = s.id
    LEFT JOIN student.students st ON st.school_id = s.id
    LEFT JOIN LATERAL (
      SELECT plan, status FROM tenancy.subscriptions
      WHERE school_id = s.id
      ORDER BY period_end DESC NULLS LAST
      LIMIT 1
    ) sub ON true
    WHERE s.id != $1`;

  if (status) {
    params.push(status);
    sql += ` AND s.status = $${params.length}`;
  }
  if (search) {
    params.push(`%${search}%`);
    sql += ` AND (s.name ILIKE $${params.length} OR s.school_address ILIKE $${params.length})`;
  }

  sql += ` GROUP BY s.id, sub.plan, sub.status ORDER BY s.created_at DESC`;

  params.push(limit, offset);
  sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

  const countParams = [PLATFORM_SCHOOL_ID];
  let countSql = `SELECT COUNT(*)::int AS total FROM tenancy.schools s WHERE s.id != $1`;
  if (status) {
    countParams.push(status);
    countSql += ` AND s.status = $${countParams.length}`;
  }
  if (search) {
    countParams.push(`%${search}%`);
    countSql += ` AND (s.name ILIKE $${countParams.length} OR s.school_address ILIKE $${countParams.length})`;
  }

  const [rows, countRes] = await Promise.all([
    query(sql, params),
    query(countSql, countParams),
  ]);

  return { rows: rows.rows, total: countRes.rows[0]?.total ?? 0 };
};

export const getSchoolById = async (schoolId) => {
  const result = await query(
    `SELECT s.id, s.name, s.school_address, s.domain, s.plan, s.status, s.created_at,
            ss.email AS settings_email, ss.phone AS settings_phone, ss.timezone,
            sub.id AS subscription_id, sub.plan AS subscription_plan, sub.status AS subscription_status,
            sub.period_start, sub.period_end,
            (SELECT COUNT(*)::int FROM identity.users WHERE school_id = s.id) AS user_count,
            (SELECT COUNT(*)::int FROM student.students WHERE school_id = s.id) AS student_count,
            (SELECT COUNT(*)::int FROM academic.teachers WHERE school_id = s.id) AS teacher_count
     FROM tenancy.schools s
     LEFT JOIN tenancy.school_settings ss ON ss.school_id = s.id
     LEFT JOIN LATERAL (
       SELECT * FROM tenancy.subscriptions WHERE school_id = s.id
       ORDER BY period_end DESC NULLS LAST LIMIT 1
     ) sub ON true
     WHERE s.id = $1 AND s.id != $2`,
    [schoolId, PLATFORM_SCHOOL_ID]
  );
  if (!result.rows[0]) {
    throw new AppError('School not found.', 404, ERROR_CODES.NOT_FOUND);
  }
  return result.rows[0];
};

export const updateSchoolStatus = async (actorId, schoolId, status) => {
  if (!SCHOOL_STATUSES.includes(status)) {
    throw new AppError('Invalid status value.', 400, ERROR_CODES.VALIDATION_ERROR);
  }

  const result = await query(
    `UPDATE tenancy.schools SET status = $1
     WHERE id = $2 AND id != $3
     RETURNING id, name, status`,
    [status, schoolId, PLATFORM_SCHOOL_ID]
  );
  if (!result.rows[0]) {
    throw new AppError('School not found.', 404, ERROR_CODES.NOT_FOUND);
  }

  await logPlatformAudit(actorId, 'school.status_change', 'school', schoolId, { status });
  return result.rows[0];
};

export const createSchoolWithAdmin = async (actorId, data) => {
  const result = await registerSchoolAndAdmin(data);
  await logPlatformAudit(actorId, 'school.create', 'school', result.schoolId, {
    admin_email: data.admin_email,
  });
  return result;
};

export const updateSchool = async (actorId, schoolId, patch) => {
  const fields = [];
  const values = [];
  const allowed = ['name', 'school_address', 'domain', 'plan'];

  for (const key of allowed) {
    if (patch[key] !== undefined) {
      values.push(patch[key]);
      fields.push(`${key} = $${values.length}`);
    }
  }
  if (!fields.length) {
    throw new AppError('No valid fields to update.', 400, ERROR_CODES.VALIDATION_ERROR);
  }

  values.push(schoolId, PLATFORM_SCHOOL_ID);
  const result = await query(
    `UPDATE tenancy.schools SET ${fields.join(', ')}
     WHERE id = $${values.length - 1} AND id != $${values.length}
     RETURNING id, name, school_address, domain, plan, status`,
    values
  );
  if (!result.rows[0]) {
    throw new AppError('School not found.', 404, ERROR_CODES.NOT_FOUND);
  }

  await logPlatformAudit(actorId, 'school.update', 'school', schoolId, patch);
  return result.rows[0];
};

export const listSubscriptions = async ({ status, limit = 100, offset = 0 } = {}) => {
  const params = [];
  let sql = `
    SELECT sub.id, sub.school_id, sub.plan, sub.status, sub.period_start, sub.period_end,
           sub.customer_id, s.name AS school_name
    FROM tenancy.subscriptions sub
    JOIN tenancy.schools s ON s.id = sub.school_id
    WHERE s.id != $1`;
  params.push(PLATFORM_SCHOOL_ID);

  if (status) {
    params.push(status);
    sql += ` AND sub.status = $${params.length}`;
  }
  sql += ` ORDER BY sub.period_end DESC NULLS LAST`;
  params.push(limit, offset);
  sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

  const result = await query(sql, params);
  return result.rows;
};

export const listPlatformAuditLogs = async ({ limit = 50, offset = 0 } = {}) => {
  const result = await query(
    `SELECT pal.id, pal.action, pal.entity, pal.entity_id, pal.meta, pal.created_at,
            u.email AS actor_email,
            u.first_name AS actor_first_name,
            u.last_name AS actor_last_name
     FROM identity.platform_audit_logs pal
     LEFT JOIN identity.users u ON u.id = pal.actor_id
     ORDER BY pal.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return result.rows;
};

export const listTenantAuditLogs = async ({ schoolId, limit = 50, offset = 0 } = {}) => {
  const params = [];
  let sql = `
    SELECT al.id, al.action, al.entity, al.entity_id, al.meta, al.created_at, al.school_id,
           s.name AS school_name, u.email AS actor_email
    FROM identity.audit_logs al
    LEFT JOIN tenancy.schools s ON s.id = al.school_id
    LEFT JOIN identity.users u ON u.id = al.user_id`;
  if (schoolId) {
    params.push(schoolId);
    sql += ` WHERE al.school_id = $1`;
  }
  params.push(limit, offset);
  sql += ` ORDER BY al.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
  const result = await query(sql, params);
  return result.rows;
};

export const getPlatformSettings = async () => {
  const result = await query(
    `SELECT key, value, description, updated_at FROM tenancy.platform_settings ORDER BY key`
  );
  return result.rows;
};

export const updatePlatformSettings = async (actorId, updates) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    for (const [key, value] of Object.entries(updates)) {
      await client.query(
        `INSERT INTO tenancy.platform_settings (key, value, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, JSON.stringify(value)]
      );
    }
    await logPlatformAudit(actorId, 'platform.settings_update', 'platform_settings', null, updates);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return getPlatformSettings();
};

export { logPlatformAudit, PLATFORM_SCHOOL_ID };
