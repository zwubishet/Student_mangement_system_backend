import { getClient, query } from '../config/db.js';
import { hashPassword, comparePasswords, generateHasuraToken } from '../utils/auth.js';
import AppError from '../utils/appError.js';


export const registerSchoolAndAdmin = async (signupData) => {
  const { schoolName, email, password, firstName, lastName } = signupData;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // 1. Check if user already exists
    const existingUser = await client.query('SELECT id FROM identity.users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      throw new AppError('Email already registered', 400);
    }

    // 2. Create the School
    const schoolRes = await client.query(
      'INSERT INTO tenancy.schools (name, plan, status) VALUES ($1, $2, $3) RETURNING id',
      [schoolName, 'BASIC', 'active']
    );
    const schoolId = schoolRes.rows[0].id;

    // 3. Create the Admin User (Fixed snake_case columns)
    const hashedPassword = await hashPassword(password);
    const userRes = await client.query(
      `INSERT INTO identity.users (school_id, email, password_hash, first_name, last_name) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [schoolId, email, hashedPassword, firstName, lastName]
    );
    const userId = userRes.rows[0].id;

    // 4. Create Admin Role (Fixed school_id)
    const roleRes = await client.query(
      'INSERT INTO identity.roles (school_id, name) VALUES ($1, $2) RETURNING id',
      [schoolId, 'admin']
    );
    const roleId = roleRes.rows[0].id;

    // 5. Link User to Role (Fixed user_id and role_id if they are snake_case too)
    // Check your userRoles table, if it's userId/roleId use camelCase, 
    // but if it's snake_case, change to user_id/role_id below:
    await client.query(
      'INSERT INTO identity.userroles (user_id, role_id) VALUES ($1, $2)',
      [userId, roleId]
    );

    await client.query('COMMIT');

    const token = generateHasuraToken({ id: userId, schoolId: schoolId });

    return { token, user: { id: userId, email, schoolId } };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const loginUser = async (email, password) => {
  // 1. Fetch user and their school status
  const userQuery = `
    SELECT u.*, s.status as school_status 
    FROM identity.users u
    JOIN tenancy.schools s ON u.school_id = s.id
    WHERE u.email = $1
  `;
  const userRes = await query(userQuery, [email]);
  const user = userRes.rows[0];

  // 2. Check if user exists and password is correct
  if (!user || !(await comparePasswords(password, user.passwordHash))) {
    throw new AppError('Incorrect email or password', 401);
  }

  // 3. Check if school/user is active (Scale Restriction)
  if (user.status !== 'active' || user.school_status !== 'active') {
    throw new AppError('This account or school has been deactivated. Please contact support.', 403);
  }

  // 4. Fetch User Roles (Crucial for Hasura Permissions)
  const rolesQuery = `
    SELECT r.name 
    FROM identity.roles r
    JOIN identity.userRoles ur ON r.id = ur.roleId
    WHERE ur.userId = $1
  `;
  const rolesRes = await query(rolesQuery, [user.id]);
  const roles = rolesRes.rows.map(row => row.name);

  if (roles.length === 0) {
    throw new AppError('User has no assigned roles. Access denied.', 403);
  }

  // 5. Generate Hasura Token with School ID and Roles
  const token = signToken({ id: user.id, schoolId: user.schoolId }, roles);

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      schoolId: user.schoolId,
      roles: roles
    }
  };
};