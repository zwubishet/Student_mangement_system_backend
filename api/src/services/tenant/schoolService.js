import { getClient, query } from '../../config/db.js';
import bcrypt from 'bcryptjs';
import { AppError, ERROR_CODES } from '../../utils/errors.js';
import { generateHasuraToken } from '../../utils/auth.js';
import { PLATFORM_SCHOOL_ID } from '../../constants/platform.js';
import {
  DEFAULT_TENANT_FEATURES,
  KNOWN_FEATURES,
  LOGIN_ALLOWED_STATUSES,
  SCHOOL_STATUSES,
} from '../../constants/tenant.js';
import { slugify, ensureUniqueSlug } from '../../utils/slugify.js';

const SCHOOL_COLUMNS = `
  s.id, s.name, s.slug, s.status, s.plan,
  s.email, s.phone, s.address, s.city, s.region, s.country,
  s.logo_url, s.timezone, s.locale,
  s.academic_year_start_month, s.grading_system, s.max_class_size,
  s.trial_ends_at, s.subscription_starts_at, s.subscription_ends_at,
  s.chapa_customer_id, s.chapa_subscription_id,
  s.provisioned_at, s.provisioned_by, s.suspended_at, s.suspended_reason,
  s.settings, s.domain, s.school_address,
  s.created_at, s.updated_at, s.is_deleted
`;

export const mapSchoolRow = (row) => {
  if (!row) return null;
  return {
    ...row,
    status: row.status?.toString?.() ?? row.status,
    plan: row.plan?.toString?.() ?? row.plan,
    address: row.address ?? row.school_address,
  };
};

export const assertSchoolLoginAllowed = (school) => {
  if (!school || school.is_deleted) {
    throw new AppError('This school is no longer available.', 403, ERROR_CODES.ACCOUNT_INACTIVE);
  }
  const status = String(school.status);
  if (status === 'trial_expired' || status === 'suspended' || status === 'inactive' || status === 'pending') {
    throw new AppError('This account or school has been deactivated. Please contact support.', 403);
  }
  if (school.plan === 'trial' && school.trial_ends_at && new Date(school.trial_ends_at) < new Date()) {
    throw new AppError('The trial period for this school has ended. Please contact support.', 403);
  }
  if (!LOGIN_ALLOWED_STATUSES.includes(status)) {
    throw new AppError('This account or school has been deactivated. Please contact support.', 403);
  }
};

const seedFeatureFlags = async (client, tenantId, flags, enabledBy = null) => {
  const list = flags?.length ? flags : DEFAULT_TENANT_FEATURES;
  for (const { feature, enabled } of list) {
    if (!KNOWN_FEATURES.includes(feature)) continue;
    await client.query(
      `INSERT INTO tenancy.feature_flags (tenant_id, feature, enabled, enabled_at, enabled_by)
       VALUES ($1, $2, $3, CASE WHEN $3 THEN now() ELSE NULL END, $4)
       ON CONFLICT (tenant_id, feature) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         enabled_at = CASE WHEN EXCLUDED.enabled THEN now() ELSE tenancy.feature_flags.enabled_at END,
         enabled_by = EXCLUDED.enabled_by`,
      [tenantId, feature, !!enabled, enabledBy]
    );
  }
};

const syncSchoolSettingsRow = async (client, schoolId, { email, phone, timezone, max_class_size }) => {
  await client.query(
    `INSERT INTO tenancy.school_settings (school_id, email, phone, timezone, max_students_per_class)
     VALUES ($1, $2, $3, COALESCE($4, 'Africa/Addis_Ababa'), COALESCE($5, 45))
     ON CONFLICT (school_id) DO UPDATE SET
       email = COALESCE(EXCLUDED.email, tenancy.school_settings.email),
       phone = COALESCE(EXCLUDED.phone, tenancy.school_settings.phone),
       timezone = COALESCE(EXCLUDED.timezone, tenancy.school_settings.timezone),
       max_students_per_class = COALESCE(EXCLUDED.max_students_per_class, tenancy.school_settings.max_students_per_class),
       updated_at = now()`,
    [schoolId, email ?? null, phone ?? null, timezone ?? null, max_class_size ?? null]
  );
};

/**
 * Provision tenant school + SCHOOL_ADMIN (used by platform and public register).
 */
export const createSchoolWithAdmin = async (data, { provisionedBy = null } = {}) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const name = data.name || data.school_name;
    const baseSlug = data.slug || slugify(name);
    const slug = await ensureUniqueSlug(client, baseSlug);

    const trialDays = data.trial_days ?? 30;
    const status = data.status || (provisionedBy ? 'active' : 'pending');
    const plan = data.plan || 'trial';

    const schoolRes = await client.query(
      `INSERT INTO tenancy.schools (
         name, slug, status, plan,
         email, phone, address, city, region, country,
         logo_url, timezone, locale,
         academic_year_start_month, grading_system, max_class_size,
         trial_ends_at, chapa_customer_id, chapa_subscription_id,
         provisioned_at, provisioned_by, settings
       ) VALUES (
         $1, $2, $3::tenancy.school_status, $4::tenancy.subscription_plan,
         $5, $6, $7, $8, $9, COALESCE($10, 'ET'),
         $11, COALESCE($12, 'Africa/Addis_Ababa'), COALESCE($13, 'en'),
         COALESCE($14, 9), COALESCE($15, 'percentage'), COALESCE($16, 45),
         CASE WHEN $4::text = 'trial' THEN now() + ($17::int || ' days')::interval ELSE $18 END,
         $19, $20,
         CASE WHEN $21::uuid IS NOT NULL THEN now() ELSE NULL END, $21,
         COALESCE($22::jsonb, '{}'::jsonb)
       )
       RETURNING id`,
      [
        name,
        slug,
        status,
        plan,
        data.email || data.admin_email || null,
        data.phone || null,
        data.address || data.school_address || null,
        data.city || null,
        data.region || null,
        data.country || 'ET',
        data.logo_url || null,
        data.timezone || null,
        data.locale || null,
        data.academic_year_start_month ?? null,
        data.grading_system || null,
        data.max_class_size ?? null,
        trialDays,
        data.trial_ends_at || null,
        data.chapa_customer_id || null,
        data.chapa_subscription_id || null,
        provisionedBy,
        JSON.stringify(data.settings || {}),
      ]
    );

    const schoolId = schoolRes.rows[0].id;

    await syncSchoolSettingsRow(client, schoolId, {
      email: data.email || data.admin_email || null,
      phone: data.phone || null,
      timezone: data.timezone || null,
      max_class_size: data.max_class_size ?? null,
    });

    await seedFeatureFlags(client, schoolId, data.feature_flags, provisionedBy);

    const hashedPw = await bcrypt.hash(data.admin_password, 12);
    const userRes = await client.query(
      `INSERT INTO identity.users (email, password_hash, school_id, first_name, last_name, status)
       VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
      [
        String(data.admin_email).trim().toLowerCase(),
        hashedPw,
        schoolId,
        data.first_name,
        data.last_name,
      ]
    );
    const userId = userRes.rows[0].id;

    await client.query(
      `INSERT INTO identity.userroles (user_id, role_id)
       SELECT $1, id FROM identity.roles
       WHERE name = 'SCHOOL_ADMIN' AND school_id IS NULL LIMIT 1`,
      [userId]
    );

    const token = generateHasuraToken({
      id: userId,
      schoolId,
      roles: ['SCHOOL_ADMIN'],
      firstName: data.first_name,
      lastName: data.last_name,
    });

    await client.query('COMMIT');
    const school = await getSchoolById(schoolId, { includeCounts: false });
    return { school, schoolId, userId, token, slug: school.slug };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      throw new AppError('School slug or email already exists.', 409, ERROR_CODES.DUPLICATE_ENTRY);
    }
    throw err;
  } finally {
    client.release();
  }
};

export const getSchoolById = async (schoolId, { includeCounts = true } = {}) => {
  const countsSql = includeCounts
    ? `, (SELECT COUNT(*)::int FROM identity.users WHERE school_id = s.id) AS user_count
       , (SELECT COUNT(*)::int FROM student.students WHERE school_id = s.id) AS student_count
       , (SELECT COUNT(*)::int FROM academic.teachers WHERE school_id = s.id) AS teacher_count`
    : '';

  const result = await query(
    `SELECT ${SCHOOL_COLUMNS}${countsSql}
     FROM tenancy.schools s
     WHERE s.id = $1 AND s.id != $2 AND s.is_deleted = false`,
    [schoolId, PLATFORM_SCHOOL_ID]
  );
  if (!result.rows[0]) {
    throw new AppError('School not found.', 404, ERROR_CODES.NOT_FOUND);
  }

  const school = mapSchoolRow(result.rows[0]);
  const flags = await query(
    `SELECT feature, enabled, enabled_at FROM tenancy.feature_flags WHERE tenant_id = $1 ORDER BY feature`,
    [schoolId]
  );
  school.feature_flags = flags.rows;
  return school;
};

export const listFeatureFlags = async (tenantId) => {
  const res = await query(
    `SELECT id, feature, enabled, enabled_at, enabled_by, created_at
     FROM tenancy.feature_flags WHERE tenant_id = $1 ORDER BY feature`,
    [tenantId]
  );
  return res.rows;
};

export const upsertFeatureFlags = async (tenantId, flags, enabledBy) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await seedFeatureFlags(client, tenantId, flags, enabledBy);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return listFeatureFlags(tenantId);
};

export const updateSchool = async (schoolId, patch) => {
  const allowed = {
    name: 'name',
    slug: 'slug',
    email: 'email',
    phone: 'phone',
    address: 'address',
    school_address: 'address',
    city: 'city',
    region: 'region',
    country: 'country',
    logo_url: 'logo_url',
    timezone: 'timezone',
    locale: 'locale',
    academic_year_start_month: 'academic_year_start_month',
    grading_system: 'grading_system',
    max_class_size: 'max_class_size',
    plan: 'plan',
    trial_ends_at: 'trial_ends_at',
    subscription_starts_at: 'subscription_starts_at',
    subscription_ends_at: 'subscription_ends_at',
    chapa_customer_id: 'chapa_customer_id',
    chapa_subscription_id: 'chapa_subscription_id',
    settings: 'settings',
    domain: 'domain',
  };

  const fields = [];
  const values = [];

  for (const [key, col] of Object.entries(allowed)) {
    if (patch[key] === undefined) continue;
    let val = patch[key];
    if (key === 'settings' && typeof val === 'object') val = JSON.stringify(val);
    if (key === 'plan') {
      fields.push(`${col} = $${values.length + 1}::tenancy.subscription_plan`);
    } else {
      fields.push(`${col} = $${values.length + 1}`);
    }
    values.push(val);
  }

  if (!fields.length) {
    throw new AppError('No valid fields to update.', 400, ERROR_CODES.VALIDATION_ERROR);
  }

  values.push(schoolId, PLATFORM_SCHOOL_ID);
  const result = await query(
    `UPDATE tenancy.schools SET ${fields.join(', ')}
     WHERE id = $${values.length - 1} AND id != $${values.length} AND is_deleted = false
     RETURNING id`,
    values
  );
  if (!result.rows[0]) {
    throw new AppError('School not found.', 404, ERROR_CODES.NOT_FOUND);
  }
  return getSchoolById(result.rows[0].id, { includeCounts: false });
};

export const updateSchoolStatus = async (schoolId, status, { reason = null, actorId = null } = {}) => {
  if (!SCHOOL_STATUSES.includes(status)) {
    throw new AppError('Invalid status value.', 400, ERROR_CODES.VALIDATION_ERROR);
  }

  const extra =
    status === 'suspended'
      ? `, suspended_at = now(), suspended_reason = $4`
      : status === 'active'
        ? `, suspended_at = NULL, suspended_reason = NULL`
        : '';

  const params = [status, schoolId, PLATFORM_SCHOOL_ID];
  if (status === 'suspended') params.push(reason);

  const result = await query(
    `UPDATE tenancy.schools
     SET status = $1::tenancy.school_status${extra}
     WHERE id = $2 AND id != $3 AND is_deleted = false
     RETURNING id, name, slug, status`,
    params
  );
  if (!result.rows[0]) {
    throw new AppError('School not found.', 404, ERROR_CODES.NOT_FOUND);
  }
  return {
    ...result.rows[0],
    status: result.rows[0].status?.toString?.() ?? result.rows[0].status,
  };
};

export const softDeleteSchool = async (schoolId) => {
  const result = await query(
    `UPDATE tenancy.schools SET is_deleted = true, status = 'inactive'::tenancy.school_status
     WHERE id = $1 AND id != $2 RETURNING id`,
    [schoolId, PLATFORM_SCHOOL_ID]
  );
  if (!result.rows[0]) throw new AppError('School not found.', 404, ERROR_CODES.NOT_FOUND);
  return result.rows[0];
};
