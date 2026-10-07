import { query, getClient } from '../../config/db.js';
import redisClient from '../../config/redis.js';
import { AppError, ERROR_CODES } from '../../utils/errors.js';
import { PLATFORM_SCHOOL_ID } from '../../constants/platform.js';
import {
  createSchoolWithAdmin,
  getSchoolById,
  updateSchool,
  updateSchoolStatus,
  listFeatureFlags,
  upsertFeatureFlags,
  mapSchoolRow,
} from '../tenant/schoolService.js';

const logPlatformAudit = async (actorId, action, entity, entityId, meta = {}) => {
  await query(
    `INSERT INTO identity.platform_audit_logs (actor_id, action, entity, entity_id, meta)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorId, action, entity, entityId ?? null, JSON.stringify(meta)]
  );
};

const notDeleted = `s.id != $1 AND COALESCE(s.is_deleted, false) = false`;

const tenantSchoolFilter = (alias = 's') =>
  `${alias}.id != $1 AND COALESCE(${alias}.is_deleted, false) = false`;

export const getPlatformOverview = async () => {
  const [schools, users, recent, students, teachers, trials, plans, activity24h] = await Promise.all([
    query(
      `SELECT status::text AS status, COUNT(*)::int AS count
       FROM tenancy.schools
       WHERE id != $1 AND COALESCE(is_deleted, false) = false
       GROUP BY status`,
      [PLATFORM_SCHOOL_ID]
    ),
    query(
      `SELECT COUNT(*)::int AS total
       FROM identity.users u
       JOIN tenancy.schools s ON s.id = u.school_id
       WHERE s.id != $1 AND COALESCE(s.is_deleted, false) = false`,
      [PLATFORM_SCHOOL_ID]
    ),
    query(
      `SELECT COUNT(*)::int AS count
       FROM tenancy.schools
       WHERE id != $1 AND COALESCE(is_deleted, false) = false
         AND created_at >= NOW() - INTERVAL '30 days'`,
      [PLATFORM_SCHOOL_ID]
    ),
    query(
      `SELECT COUNT(*)::int AS total
       FROM student.students st
       JOIN tenancy.schools s ON s.id = st.school_id
       WHERE ${tenantSchoolFilter('s')} AND st.deleted_at IS NULL`,
      [PLATFORM_SCHOOL_ID]
    ),
    query(
      `SELECT COUNT(*)::int AS total
       FROM academic.teachers t
       JOIN tenancy.schools s ON s.id = t.school_id
       WHERE ${tenantSchoolFilter('s')} AND t.deleted_at IS NULL`,
      [PLATFORM_SCHOOL_ID]
    ),
    query(
      `SELECT COUNT(*)::int AS count
       FROM tenancy.schools
       WHERE id != $1 AND COALESCE(is_deleted, false) = false
         AND status = 'active' AND trial_ends_at IS NOT NULL
         AND trial_ends_at <= NOW() + INTERVAL '7 days'`,
      [PLATFORM_SCHOOL_ID]
    ),
    query(
      `SELECT plan::text AS plan, COUNT(*)::int AS count
       FROM tenancy.schools
       WHERE id != $1 AND COALESCE(is_deleted, false) = false
       GROUP BY plan`,
      [PLATFORM_SCHOOL_ID]
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM (
         SELECT created_at FROM identity.platform_audit_logs
         WHERE created_at >= NOW() - INTERVAL '24 hours'
         UNION ALL
         SELECT created_at FROM identity.audit_logs
         WHERE created_at >= NOW() - INTERVAL '24 hours'
       ) recent`,
      []
    ).catch(() => ({ rows: [{ count: 0 }] })),
  ]);

  const byStatus = Object.fromEntries(schools.rows.map((r) => [r.status, r.count]));
  const totalSchools = schools.rows.reduce((sum, r) => sum + r.count, 0);
  const byPlan = Object.fromEntries(plans.rows.map((r) => [r.plan, r.count]));

  return {
    schools: {
      total: totalSchools,
      active: byStatus.active ?? 0,
      pending: byStatus.pending ?? 0,
      suspended: byStatus.suspended ?? 0,
      inactive: byStatus.inactive ?? 0,
      trial_expired: byStatus.trial_expired ?? 0,
      created_last_30_days: recent.rows[0]?.count ?? 0,
      trials_expiring_7d: trials.rows[0]?.count ?? 0,
    },
    users: { total: users.rows[0]?.total ?? 0 },
    students: { total: students.rows[0]?.total ?? 0 },
    teachers: { total: teachers.rows[0]?.total ?? 0 },
    activity_24h: activity24h.rows[0]?.count ?? 0,
    plans: byPlan,
  };
};

export const getSchoolTenantSummary = async (schoolId) => {
  if (schoolId === PLATFORM_SCHOOL_ID) {
    throw new AppError('Invalid school', 400, ERROR_CODES.VALIDATION_ERROR);
  }
  const [school, counts, recentAudit] = await Promise.all([
    getSchoolById(schoolId),
    query(
      `SELECT
         COUNT(DISTINCT u.id)::int AS users,
         COUNT(DISTINCT st.id)::int AS students,
         COUNT(DISTINCT t.id)::int AS teachers,
         COUNT(DISTINCT CASE WHEN st.lifecycle_status = 'active' THEN st.id END)::int AS active_students
       FROM tenancy.schools s
       LEFT JOIN identity.users u ON u.school_id = s.id
       LEFT JOIN student.students st ON st.school_id = s.id AND st.deleted_at IS NULL
       LEFT JOIN academic.teachers t ON t.school_id = s.id AND t.deleted_at IS NULL
       WHERE s.id = $1 AND COALESCE(s.is_deleted, false) = false`,
      [schoolId]
    ),
    query(
      `SELECT al.id, al.action, al.entity, al.entity_id, al.created_at, u.email AS actor_email
       FROM identity.audit_logs al
       LEFT JOIN identity.users u ON u.id = al.user_id
       WHERE al.school_id = $1
       ORDER BY al.created_at DESC LIMIT 8`,
      [schoolId]
    ).catch(() => ({ rows: [] })),
  ]);
  return {
    school,
    counts: counts.rows[0] || { users: 0, students: 0, teachers: 0, active_students: 0 },
    recent_activity: recentAudit.rows,
  };
};

export const listPlatformUsers = async ({
  schoolId,
  search,
  role,
  status,
  limit = 50,
  offset = 0,
} = {}) => {
  const params = [PLATFORM_SCHOOL_ID];
  let sql = `
    SELECT u.id, u.email, u.first_name, u.last_name, u.status, u.created_at,
           s.id AS school_id, s.name AS school_name,
           COALESCE(
             (SELECT string_agg(r.name, ', ' ORDER BY r.name)
              FROM identity.userroles ur
              JOIN identity.roles r ON r.id = ur.role_id
              WHERE ur.user_id = u.id),
             ''
           ) AS roles
    FROM identity.users u
    JOIN tenancy.schools s ON s.id = u.school_id
    WHERE ${tenantSchoolFilter('s')}`;

  if (schoolId) {
    params.push(schoolId);
    sql += ` AND u.school_id = $${params.length}`;
  }
  if (status) {
    params.push(status);
    sql += ` AND u.status = $${params.length}`;
  }
  if (role) {
    params.push(role);
    sql += ` AND EXISTS (
      SELECT 1 FROM identity.userroles ur
      JOIN identity.roles r ON r.id = ur.role_id
      WHERE ur.user_id = u.id AND r.name = $${params.length}
    )`;
  }
  if (search) {
    params.push(`%${search}%`);
    sql += ` AND (
      u.email ILIKE $${params.length}
      OR u.first_name ILIKE $${params.length}
      OR u.last_name ILIKE $${params.length}
      OR s.name ILIKE $${params.length}
    )`;
  }

  let countSql = `
    SELECT COUNT(DISTINCT u.id)::int AS total
    FROM identity.users u
    JOIN tenancy.schools s ON s.id = u.school_id
    WHERE ${tenantSchoolFilter('s')}`;
  const countParams = [PLATFORM_SCHOOL_ID];
  if (schoolId) { countParams.push(schoolId); countSql += ` AND u.school_id = $${countParams.length}`; }
  if (status) { countParams.push(status); countSql += ` AND u.status = $${countParams.length}`; }
  if (role) {
    countParams.push(role);
    countSql += ` AND EXISTS (
      SELECT 1 FROM identity.userroles ur
      JOIN identity.roles r ON r.id = ur.role_id
      WHERE ur.user_id = u.id AND r.name = $${countParams.length}
    )`;
  }
  if (search) {
    countParams.push(`%${search}%`);
    countSql += ` AND (u.email ILIKE $${countParams.length} OR u.first_name ILIKE $${countParams.length} OR u.last_name ILIKE $${countParams.length} OR s.name ILIKE $${countParams.length})`;
  }

  sql += ` ORDER BY u.created_at DESC`;
  params.push(limit, offset);
  sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

  const [rows, countRes] = await Promise.all([
    query(sql, params),
    query(countSql, countParams),
  ]);
  return { rows: rows.rows, total: countRes.rows[0]?.total ?? 0 };
};

export const listPlatformStudents = async ({
  schoolId,
  search,
  status,
  limit = 50,
  offset = 0,
} = {}) => {
  const params = [PLATFORM_SCHOOL_ID];
  let sql = `
    SELECT st.id, st.admission_number, st.first_name, st.last_name, st.gender,
           st.lifecycle_status, st.is_active, st.created_at,
           s.id AS school_id, s.name AS school_name,
           u.email,
           g.name AS grade_name, sec.name AS section_name
    FROM student.students st
    JOIN tenancy.schools s ON s.id = st.school_id
    LEFT JOIN identity.users u ON u.id = st.user_id
    LEFT JOIN student.studentenrollments se ON se.student_id = st.id AND se.status = 'active'
    LEFT JOIN academic.sections sec ON sec.id = se.section_id
    LEFT JOIN academic.classes c ON c.id = se.class_id
    LEFT JOIN academic.grades g ON g.id = COALESCE(c.grade_id, sec.grade_id)
    WHERE ${tenantSchoolFilter('s')} AND st.deleted_at IS NULL`;

  if (schoolId) {
    params.push(schoolId);
    sql += ` AND st.school_id = $${params.length}`;
  }
  if (status) {
    params.push(status);
    sql += ` AND st.lifecycle_status = $${params.length}`;
  }
  if (search) {
    params.push(`%${search}%`);
    sql += ` AND (
      st.first_name ILIKE $${params.length}
      OR st.last_name ILIKE $${params.length}
      OR st.admission_number ILIKE $${params.length}
      OR u.email ILIKE $${params.length}
      OR s.name ILIKE $${params.length}
    )`;
  }

  let countSql = `
    SELECT COUNT(DISTINCT st.id)::int AS total
    FROM student.students st
    JOIN tenancy.schools s ON s.id = st.school_id
    LEFT JOIN identity.users u ON u.id = st.user_id
    WHERE ${tenantSchoolFilter('s')} AND st.deleted_at IS NULL`;
  const countParams = [PLATFORM_SCHOOL_ID];
  if (schoolId) { countParams.push(schoolId); countSql += ` AND st.school_id = $${countParams.length}`; }
  if (status) { countParams.push(status); countSql += ` AND st.lifecycle_status = $${countParams.length}`; }
  if (search) {
    countParams.push(`%${search}%`);
    countSql += ` AND (st.first_name ILIKE $${countParams.length} OR st.last_name ILIKE $${countParams.length} OR st.admission_number ILIKE $${countParams.length} OR u.email ILIKE $${countParams.length} OR s.name ILIKE $${countParams.length})`;
  }

  sql += ` ORDER BY st.created_at DESC`;
  params.push(limit, offset);
  sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

  const [rows, countRes] = await Promise.all([
    query(sql, params),
    query(countSql, countParams),
  ]);

  return { rows: rows.rows, total: countRes.rows[0]?.total ?? 0 };
};

export const listPlatformTeachers = async ({
  schoolId,
  search,
  status,
  limit = 50,
  offset = 0,
} = {}) => {
  const params = [PLATFORM_SCHOOL_ID];
  let sql = `
    SELECT t.id, t.first_name, t.last_name, t.email, t.phone, t.department,
           t.status, t.leave_status, t.created_at,
           s.id AS school_id, s.name AS school_name,
           COUNT(DISTINCT ta.section_id)::int AS sections
    FROM academic.teachers t
    JOIN tenancy.schools s ON s.id = t.school_id
    LEFT JOIN academic.teacherassignments ta ON ta.teacher_id = t.user_id
    WHERE ${tenantSchoolFilter('s')} AND t.deleted_at IS NULL`;

  if (schoolId) {
    params.push(schoolId);
    sql += ` AND t.school_id = $${params.length}`;
  }
  if (status) {
    params.push(status);
    sql += ` AND t.status = $${params.length}`;
  }
  if (search) {
    params.push(`%${search}%`);
    sql += ` AND (
      t.first_name ILIKE $${params.length}
      OR t.last_name ILIKE $${params.length}
      OR t.email ILIKE $${params.length}
      OR s.name ILIKE $${params.length}
    )`;
  }

  sql += ` GROUP BY t.id, s.id, s.name ORDER BY t.created_at DESC`;
  params.push(limit, offset);
  sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

  let countSql = `
    SELECT COUNT(*)::int AS total FROM academic.teachers t
    JOIN tenancy.schools s ON s.id = t.school_id
    WHERE ${tenantSchoolFilter('s')} AND t.deleted_at IS NULL`;
  const countParams = [PLATFORM_SCHOOL_ID];
  if (schoolId) { countParams.push(schoolId); countSql += ` AND t.school_id = $${countParams.length}`; }
  if (status) { countParams.push(status); countSql += ` AND t.status = $${countParams.length}`; }
  if (search) {
    countParams.push(`%${search}%`);
    countSql += ` AND (t.first_name ILIKE $${countParams.length} OR t.last_name ILIKE $${countParams.length} OR t.email ILIKE $${countParams.length})`;
  }

  const [rows, countRes] = await Promise.all([
    query(sql, params),
    query(countSql, countParams),
  ]);
  return { rows: rows.rows, total: countRes.rows[0]?.total ?? 0 };
};

export const getPlatformActivityFeed = async ({ schoolId, limit = 60, offset = 0 } = {}) => {
  const params = [];
  let tenantWhere = '';
  if (schoolId) {
    params.push(schoolId);
    tenantWhere = `WHERE al.school_id = $1`;
  }

  const platformSql = `
    SELECT 'platform' AS source, pal.id::text AS id, pal.action, pal.entity,
           pal.entity_id, pal.meta, pal.created_at,
           u.email AS actor_email, NULL::uuid AS school_id, NULL::text AS school_name
    FROM identity.platform_audit_logs pal
    LEFT JOIN identity.users u ON u.id = pal.actor_id`;

  const tenantSql = `
    SELECT 'tenant' AS source, al.id::text AS id, al.action, al.entity,
           al.entity_id, al.meta, al.created_at,
           u.email AS actor_email, al.school_id, s.name AS school_name
    FROM identity.audit_logs al
    LEFT JOIN identity.users u ON u.id = al.user_id
    LEFT JOIN tenancy.schools s ON s.id = al.school_id
    ${tenantWhere}`;

  params.push(limit, offset);
  const lim = params.length - 1;
  const off = params.length;

  const sql = `
    SELECT * FROM (
      ${platformSql}
      UNION ALL
      ${tenantSql}
    ) feed
    ORDER BY created_at DESC
    LIMIT $${lim} OFFSET $${off}`;

  const result = await query(sql, params);
  return result.rows;
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

export const listSchools = async ({ search, status, plan, limit = 50, offset = 0 } = {}) => {
  const params = [PLATFORM_SCHOOL_ID];
  let sql = `
    SELECT s.id, s.name, s.slug, s.address, s.school_address, s.plan::text AS plan,
           s.status::text AS status, s.email, s.city, s.region, s.trial_ends_at,
           s.created_at, s.provisioned_at,
           COUNT(DISTINCT u.id)::int AS user_count,
           COUNT(DISTINCT st.id)::int AS student_count
    FROM tenancy.schools s
    LEFT JOIN identity.users u ON u.school_id = s.id
    LEFT JOIN student.students st ON st.school_id = s.id
    WHERE ${notDeleted}`;

  if (status) {
    params.push(status);
    sql += ` AND s.status = $${params.length}::tenancy.school_status`;
  }
  if (plan) {
    params.push(plan);
    sql += ` AND s.plan = $${params.length}::tenancy.subscription_plan`;
  }
  if (search) {
    params.push(`%${search}%`);
    sql += ` AND (
      s.name ILIKE $${params.length}
      OR s.slug ILIKE $${params.length}
      OR s.address ILIKE $${params.length}
      OR s.school_address ILIKE $${params.length}
      OR s.email ILIKE $${params.length}
    )`;
  }

  sql += ` GROUP BY s.id ORDER BY s.created_at DESC`;
  params.push(limit, offset);
  sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

  const countParams = [PLATFORM_SCHOOL_ID];
  let countSql = `SELECT COUNT(*)::int AS total FROM tenancy.schools s WHERE ${notDeleted}`;
  if (status) {
    countParams.push(status);
    countSql += ` AND s.status = $${countParams.length}::tenancy.school_status`;
  }
  if (plan) {
    countParams.push(plan);
    countSql += ` AND s.plan = $${countParams.length}::tenancy.subscription_plan`;
  }
  if (search) {
    countParams.push(`%${search}%`);
    countSql += ` AND (s.name ILIKE $${countParams.length} OR s.slug ILIKE $${countParams.length})`;
  }

  const [rows, countRes] = await Promise.all([
    query(sql, params),
    query(countSql, countParams),
  ]);

  return {
    rows: rows.rows.map((r) => mapSchoolRow({ ...r, address: r.address ?? r.school_address })),
    total: countRes.rows[0]?.total ?? 0,
  };
};

export const getSchoolByIdPlatform = (schoolId) => getSchoolById(schoolId);

export const updateSchoolStatusPlatform = async (actorId, schoolId, status, reason) => {
  const data = await updateSchoolStatus(schoolId, status, { reason, actorId });
  await logPlatformAudit(actorId, 'school.status_change', 'school', schoolId, { status, reason });
  return data;
};

export const createSchoolWithAdminPlatform = async (actorId, data) => {
  const result = await createSchoolWithAdmin(data, { provisionedBy: actorId });
  await logPlatformAudit(actorId, 'school.create', 'school', result.schoolId, {
    slug: result.slug,
    admin_email: data.admin_email,
  });
  return result;
};

export const updateSchoolPlatform = async (actorId, schoolId, patch) => {
  const data = await updateSchool(schoolId, patch);
  await logPlatformAudit(actorId, 'school.update', 'school', schoolId, patch);
  return data;
};

export const getSchoolFeatureFlags = (schoolId) => listFeatureFlags(schoolId);

export const setSchoolFeatureFlags = async (actorId, schoolId, flags) => {
  await getSchoolById(schoolId);
  const data = await upsertFeatureFlags(schoolId, flags, actorId);
  await logPlatformAudit(actorId, 'school.feature_flags', 'school', schoolId, { flags });
  return data;
};

export const listSubscriptions = async ({ status, limit = 100, offset = 0 } = {}) => {
  const params = [PLATFORM_SCHOOL_ID];
  let sql = `
    SELECT sub.id, sub.school_id, sub.plan, sub.status, sub.period_start, sub.period_end,
           sub.customer_id, s.name AS school_name, s.slug
    FROM tenancy.subscriptions sub
    JOIN tenancy.schools s ON s.id = sub.school_id
    WHERE s.id != $1 AND COALESCE(s.is_deleted, false) = false`;

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
