import { getClient, query } from '../config/db.js';
import { hashPassword, comparePasswords, generateHasuraToken } from '../utils/auth.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import bcrypt from 'bcryptjs';

export const registerSchoolAndAdmin = async (data) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    // 1. Create School
    const schoolRes = await client.query(
      `INSERT INTO tenancy.schools (name, school_address, status) 
       VALUES ($1, $2, 'active') RETURNING id`,
      [data.school_name, data.school_address]
    );
    const schoolId = schoolRes.rows[0].id;

    // 2. Create Admin User
    const hashedPw = await bcrypt.hash(data.admin_password, 12);
    const userRes = await client.query(
      `INSERT INTO identity.users (email, password_hash, school_id, first_name, last_name, status)
       VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
      [data.admin_email, hashedPw, schoolId, data.first_name, data.last_name]
    );
    const userId = userRes.rows[0].id;

    // 3. Assign SCHOOL_ADMIN Role
    await client.query(
      `INSERT INTO identity.userroles (user_id, role_id)
       SELECT $1, id FROM identity.roles
       WHERE name = 'SCHOOL_ADMIN' AND school_id IS NULL
       LIMIT 1`,
      [userId]
    );

    // 4. Generate Token for immediate login
    const token = generateHasuraToken({
      id: userId,
      schoolId: schoolId,
      roles: ['SCHOOL_ADMIN'],
      firstName: data.first_name,
      lastName: data.last_name
    });

    await client.query('COMMIT');

    return { schoolId, userId, token };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const loginUser = async (email, password) => {
  const userQuery = `
    SELECT u.*, s.status AS school_status
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

  if (!isPlatformAdmin && user.school_status !== 'active') {
    throw new AppError('This account or school has been deactivated. Please contact support.', 403);
  }

  if (!isPlatformAdmin) {
    const maintRes = await query(
      `SELECT value FROM tenancy.platform_settings WHERE key = 'maintenance_mode'`
    );
    const maint = maintRes.rows[0]?.value;
    if (maint === true || maint === 'true') {
      throw new AppError('The platform is under maintenance. Please try again later.', 503);
    }
  }

  // 5. Generate Hasura Token with School ID and Roles
  // Change this line in loginUser:
  const token = generateHasuraToken({ 
    id: user.id, 
    schoolId: user.school_id, // Ensure you use snake_case from DB
    roles: roles,             // Put roles inside the object
    firstName: user.first_name, 
    lastName: user.last_name, 
    teacherId: teacherInfo ? teacherInfo.teacher_id : null // Include teacher ID if exists
  });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      schoolId: user.school_id,
      roles: roles
    }
  };
};