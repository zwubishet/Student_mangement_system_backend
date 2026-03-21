import { getClient } from '../../config/db.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';
import bcrypt from 'bcryptjs';

export const registerAndEnrollStudent = catchAsync(async (req, res, next) => {
  const { 
    email, password, first_name, last_name, gender, 
    date_of_birth, admission_number, section_id, academic_year_id 
  } = req.body;
  
  const school_id = req.user.schoolId;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // 1. Create the User (Identity)
    const hashedPw = await bcrypt.hash(password || 'Student123!', 12);
    const userRes = await client.query(
      `INSERT INTO identity.users (email, password_hash, school_id, first_name, last_name, status) 
       VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
      [email, hashedPw, school_id, first_name, last_name]
    );
    const user_id = userRes.rows[0].id;

    const roleRes = await client.query(
       `SELECT id FROM identity.roles WHERE name = 'STUDENT' AND school_id = $1`,
       [school_id]
    );

    // If "STUDENT" role doesn't exist, create it
    if (roleRes.rows.length === 0) {
      await client.query(
        `INSERT INTO identity.roles (name, school_id) VALUES ($1, $2)`,
        ['STUDENT', school_id]
      );
    }


    // 2. Assign "STUDENT" Role (Assuming role ID for student exists)
    await client.query(
      `INSERT INTO identity.userroles (user_id, role_id) 
       SELECT $1, id FROM identity.roles WHERE name = 'STUDENT' AND school_id = $2`,
      [user_id, school_id]
    );

    // 3. Create Student Profile
    const studentRes = await client.query(
      `INSERT INTO student.students (school_id, user_id, admission_number, first_name, last_name, gender, date_of_birth)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [school_id, user_id, admission_number, first_name, last_name, gender, date_of_birth]
    );
    const student_id = studentRes.rows[0].id;

    // 4. Enroll in Section
    const enrollmentRes = await client.query(
      `INSERT INTO student.studentenrollments (school_id, student_id, section_id, academic_year_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [school_id, student_id, section_id, academic_year_id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      status: 'success',
      data: {
        student: studentRes.rows[0],
        enrollment: enrollmentRes.rows[0]
      }
    });

  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return next(new AppError('Email or Admission Number already exists.', 400));
    }
    return next(new AppError(err.message, 500));
  } finally {
    client.release();
  }
});