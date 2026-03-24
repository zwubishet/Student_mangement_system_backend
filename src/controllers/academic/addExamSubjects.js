import { getClient } from '../../config/db.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';

export const handleSetupExamSubjectsAction = catchAsync(async (req, res, next) => {
  const { exam_id, subjects } = req.body.input;
  const school_id = req.body.session_variables['x-hasura-school-id'];

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. SECURITY: Verify the Exam belongs to this school
    const examCheck = await client.query(
      `SELECT id FROM operations.exams WHERE id = $1 AND school_id = $2`,
      [exam_id, school_id]
    );
    if (examCheck.rows.length === 0) {
      throw new Error('Unauthorized: Exam not found or access denied.');
    }

    // 2. BATCH UPSERT with Security Validation
    const results = await Promise.all(subjects.map(async (sub) => {
      // Verify subject ownership inside the loop for safety
      const subCheck = await client.query(
        `SELECT id FROM academic.subjects WHERE id = $1 AND school_id = $2`,
        [sub.subject_id, school_id]
      );
      
      if (subCheck.rows.length === 0) {
        throw new Error(`Subject with ID ${sub.subject_id} does not belong to your school.`);
      }

      return client.query(
        `INSERT INTO operations.examsubjects (exam_id, subject_id, max_score) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (exam_id, subject_id) 
         DO UPDATE SET max_score = EXCLUDED.max_score
         RETURNING id`,
        [exam_id, sub.subject_id, sub.max_score]
      );
    }));

    await client.query('COMMIT');

    res.json({ 
      affected_rows: results.length,
      message: `Successfully configured ${results.length} subjects.`
    });

  } catch (err) {
    await client.query('ROLLBACK');
    // Return a 400 so the user sees exactly why it failed (Constraint vs Auth)
    return next(new AppError(err.message, 400));
  } finally {
    client.release();
  }
});