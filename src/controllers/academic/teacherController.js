import { getClient } from '../../config/db.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';
import bcrypt from 'bcryptjs';

export const createTeacher = catchAsync(async (req, res, next) => {
  const { input, session_variables } = req.body;
  const { first_name, last_name, email, phone, hire_date } = input.object;
  const school_id = session_variables['x-hasura-school-id'];
  if (!school_id) return next(new AppError('Unauthorized', 401));

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const hashedPw = await bcrypt.hash('Teacher123!', 12);
    const userRes = await client.query(
      `INSERT INTO identity.users (email, first_name, last_name, school_id, status, password_hash) 
       VALUES ($1, $2, $3, $4, 'active', $5) RETURNING id`,
      [email, first_name, last_name, school_id, hashedPw]
    );
    const userId = userRes.rows[0].id;

    // TEACHER role is global (no school_id) — fix the original bug
    await client.query(
      `INSERT INTO identity.userroles (user_id, role_id) 
       SELECT $1, id FROM identity.roles WHERE name = 'TEACHER' LIMIT 1`,
      [userId]
    );

    const teacherRes = await client.query(
      `INSERT INTO academic.teachers (school_id, user_id, first_name, last_name, email, phone, hire_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [school_id, userId, first_name, last_name, email, phone, hire_date]
    );

    await client.query('COMMIT');
    res.json({ teacher_id: teacherRes.rows[0].id, user_id: userId, email });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return next(new AppError('Email already exists.', 400));
    return next(new AppError(err.message, 500));
  } finally {
    client.release();
  }
});
