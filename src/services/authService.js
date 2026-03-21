import { getClient, query } from '../config/db.js';
import { hashPassword, comparePasswords, generateHasuraToken } from '../utils/auth.js';
import AppError from '../utils/appError.js';
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
       SELECT $1, id FROM identity.roles WHERE name = 'SCHOOL_ADMIN'`,
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
  if (!user || !(await comparePasswords(password, user.password_hash))) {
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
    JOIN identity.userroles ur ON r.id = ur.role_id
    WHERE ur.user_id = $1
  `;
  const rolesRes = await query(rolesQuery, [user.id]);
  const roles = rolesRes.rows.map(row => row.name);

  if (roles.length === 0) {
    throw new AppError('User has no assigned roles. Access denied.', 403);
  }

  // 5. Generate Hasura Token with School ID and Roles
  // Change this line in loginUser:
  const token = generateHasuraToken({ 
    id: user.id, 
    schoolId: user.school_id, // Ensure you use snake_case from DB
    roles: roles,             // Put roles inside the object
    firstName: user.first_name, 
    lastName: user.last_name 
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