import { getClient } from '../../config/db.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';
import bcrypt from 'bcryptjs';

export const registerAndEnrollStudent = catchAsync(async (req, res, next) => {
  const { input, session_variables } = req.body;
  const { 
    email, password, first_name, last_name, gender, 
    date_of_birth, admission_number, section_id, academic_year_id 
  } = input.object;

  const school_id = session_variables['x-hasura-school-id'];
  if (!school_id) return next(new AppError('Unauthorized', 401));

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. HIGH-SCALE CAPACITY CHECK
    // We join the 'classes' table (where capacity is stored) with 'studentenrollments'
    const capacityCheck = await client.query(
      `SELECT 
          c.capacity, 
          COUNT(e.id) as current_enrollment
       FROM academic.classes c
       LEFT JOIN academic.studentenrollments e ON c.section_id = e.section_id AND c.academic_year_id = e.academic_year_id
       WHERE c.section_id = $1 AND c.academic_year_id = $2 AND c.school_id = $3
       GROUP BY c.capacity`,
      [section_id, academic_year_id, school_id]
    );

    if (capacityCheck.rows.length === 0) {
      throw new Error('This class/section has not been activated for this academic year.');
    }

    const { capacity, current_enrollment } = capacityCheck.rows[0];

    if (parseInt(current_enrollment) >= parseInt(capacity)) {
      return next(new AppError(`Classroom Full: Maximum capacity of ${capacity} reached.`, 400));
    }

    // 2. IDENTITY: Create User
    const hashedPw = await bcrypt.hash(password || 'Student123!', 12);
    const userRes = await client.query(
      `INSERT INTO identity.users (email, password_hash, school_id, first_name, last_name, status) 
       VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
      [email, hashedPw, school_id, first_name, last_name]
    );
    const userId = userRes.rows[0].id;

    // 3. ROLE: Assign Student Role
    await client.query(
      `INSERT INTO identity.userroles (user_id, role_id) 
       SELECT $1, id FROM identity.roles WHERE name = 'STUDENT' LIMIT 1`,
      [userId]
    );

    // 4. PROFILE: Create Student record
    const studentRes = await client.query(
      `INSERT INTO academic.students (school_id, user_id, admission_number, first_name, last_name, gender, date_of_birth)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [school_id, userId, admission_number, first_name, last_name, gender, date_of_birth]
    );
    const studentId = studentRes.rows[0].id;

    // 5. ENROLLMENT: Finalize
    const enrollmentRes = await client.query(
      `INSERT INTO academic.studentenrollments (school_id, student_id, section_id, academic_year_id, status)
       VALUES ($1, $2, $3, $4, 'active') RETURNING id`,
      [school_id, studentId, section_id, academic_year_id]
    );

    await client.query('COMMIT');

    res.json({
      student_id: studentId,
      user_id: userId,
      enrollment_id: enrollmentRes.rows[0].id,
      message: `Enrolled successfully. ${parseInt(current_enrollment) + 1}/${capacity} seats taken.`
    });

  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return next(new AppError('Email or Admission Number already exists.', 400));
    }
    return next(new AppError(err.message, 400));
  } finally {
    client.release();
  }
});