import { getClient } from '../../config/db.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';


export const handleSubmitExamResultsAction = catchAsync(async (req, res, next) => {
  const { exam_subject_id, results } = req.body.input;
  const school_id = req.body.session_variables['x-hasura-school-id'];

  const getLetterGrade = (percentage) => {
    if (percentage >= 90) return 'A+';
    if (percentage >= 85) return 'A';
    if (percentage >= 75) return 'B';
    if (percentage >= 50) return 'C';
    return 'F';
  };

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. SECURITY & DATA CHECK: Get max_score AND verify school ownership
    const metaRes = await client.query(
      `SELECT es.max_score 
       FROM operations.examsubjects es
       JOIN operations.exams e ON es.exam_id = e.id
       WHERE es.id = $1 AND e.school_id = $2`, 
      [exam_subject_id, school_id]
    );

    if (metaRes.rows.length === 0) {
        throw new Error('Unauthorized: Exam subject not found for your school.');
    }
    const maxScore = metaRes.rows[0].max_score;

    for (const row of results) {
        if (row.score > maxScore) {
            throw new Error(`Score ${row.score} exceeds max allowed ${maxScore}`);
        }
        
        // 2. TENANCY CHECK: Ensure student belongs to this school
        const studentCheck = await client.query(
            `SELECT id FROM student.students WHERE id = $1 AND school_id = $2`,
            [row.student_id, school_id]
        );
        if (studentCheck.rows.length === 0) {
            throw new Error(`Student ${row.student_id} does not belong to your school.`);
        }

        const percentage = (row.score / maxScore) * 100;
        const grade = getLetterGrade(percentage);

        await client.query(
            `INSERT INTO operations.examresults (exam_subject_id, student_id, score, grade)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (exam_subject_id, student_id) 
            DO UPDATE SET score = EXCLUDED.score, grade = EXCLUDED.grade`,
            [exam_subject_id, row.student_id, row.score, grade]
        );
    }

    await client.query('COMMIT');
    res.json({ status: "success" });
  } catch (err) {
    await client.query('ROLLBACK');
    return next(new AppError(err.message, 400));
  } finally {
    client.release();
  }
});