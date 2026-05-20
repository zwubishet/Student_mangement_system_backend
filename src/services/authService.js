import { query } from '../config/db.js';
import { comparePasswords, generateHasuraToken } from '../utils/auth.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { createSchoolWithAdmin, assertSchoolLoginAllowed } from './tenant/schoolService.js';

export const registerSchoolAndAdmin = async (data, options = {}) => {
  return createSchoolWithAdmin(data, options);
};

export const loginUser = async (email, password) => {
  const userQuery = `
    SELECT u.*,
           s.status AS school_status, s.plan AS school_plan, s.trial_ends_at,
           s.is_deleted AS school_deleted, s.slug AS school_slug
    FROM identity.users u
    LEFT JOIN tenancy.schools s ON u.school_id = s.id
    WHERE lower(u.email) = $1
  `;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const userRes = await query(userQuery, [normalizedEmail]);
  const user = userRes.rows[0];

  if (!user || !(await comparePasswords(password, user.password_hash))) {
    throw new AppError('Incorrect email or password', 401, ERROR_CODES.INVALID_CREDENTIALS);
  }

  const rolesQuery = `
    SELECT r.name
    FROM identity.roles r
    JOIN identity.userroles ur ON r.id = ur.role_id
    WHERE ur.user_id = $1
    ORDER BY CASE r.name
      WHEN 'SUPER_ADMIN' THEN 0
      WHEN 'SCHOOL_ADMIN' THEN 1
      ELSE 2
    END, r.name
  `;
  const rolesRes = await query(rolesQuery, [user.id]);
  const roles = rolesRes.rows.map((row) => row.name);

  if (roles.length === 0) {
    throw new AppError('User has no assigned roles. Access denied.', 403);
  }

  const isPlatformAdmin = roles.includes('SUPER_ADMIN');

  const teacherRes = await query(
    `SELECT t.id AS teacher_id FROM academic.teachers t WHERE t.user_id = $1`,
    [user.id]
  );
  const teacherInfo = teacherRes.rows[0];

  if (user.status !== 'active') {
    throw new AppError('This account has been deactivated. Please contact support.', 403);
  }

  if (!isPlatformAdmin) {
    assertSchoolLoginAllowed({
      status: user.school_status?.toString?.() ?? user.school_status,
      plan: user.school_plan?.toString?.() ?? user.school_plan,
      trial_ends_at: user.trial_ends_at,
      is_deleted: user.school_deleted,
    });

    const maintRes = await query(
      `SELECT value FROM tenancy.platform_settings WHERE key = 'maintenance_mode'`
    );
    const maint = maintRes.rows[0]?.value;
    if (maint === true || maint === 'true') {
      throw new AppError('The platform is under maintenance. Please try again later.', 503);
    }
  }

  const token = generateHasuraToken({
    id: user.id,
    schoolId: user.school_id,
    roles,
    firstName: user.first_name,
    lastName: user.last_name,
    teacherId: teacherInfo ? teacherInfo.teacher_id : null,
  });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      schoolId: user.school_id,
      schoolSlug: user.school_slug,
      roles,
    },
  };
};
