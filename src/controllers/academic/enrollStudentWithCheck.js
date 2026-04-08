import { getClient } from '../../config/db.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';

export const enrollStudentWithCheck = catchAsync(async (req, res, next) => {
  const { input, session_variables } = req.body;
  // Ensure we are pulling correctly from the 'object' wrapper Hasura sends
  const { student_id, section_id, academic_year_id } = input.object;

  const school_id = session_variables['x-hasura-school-id'];
  if (!school_id) return next(new AppError('Unauthorized: School context missing.', 401));

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. IMPROVED CHECK: Query the enrollment table directly for this Year
    // This matches the logic of your "unique_student_year_enrollment" constraint
    const checkEnrollment = await client.query(
      `SELECT se.id 
       FROM student.studentenrollments se
       WHERE se.student_id = $1 
       AND se.academic_year_id = $2
       LIMIT 1`,
      [student_id, academic_year_id]
    );

    // 2. Clearer Conflict Message
    if (checkEnrollment.rows.length > 0) {
      // We throw a specific string so the catch block turns it into a 400 error
      throw new Error(`This student is already enrolled in a class for the selected academic year.`);
    }

    // 3. Perform the Enrollment
    // Ensure the column names here match your DB exactly (academic_year_id vs year_id)
    const enrollmentRes = await client.query(
      `INSERT INTO student.studentenrollments (student_id, section_id, academic_year_id, school_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [student_id, section_id, academic_year_id, school_id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: "Student enrolled successfully.",
      enrollment_id: enrollmentRes.rows[0].id
    });

  } catch (err) {
    await client.query('ROLLBACK');
    
    // Check if the error is the Postgres Unique Constraint violation 
    // in case the SELECT check missed a race condition
    if (err.code === '23505') {
      return next(new AppError('Student is already enrolled for this year (Database Constraint).', 400));
    }

    return next(new AppError(err.message, 400));
  } finally {
    client.release();
  }
});