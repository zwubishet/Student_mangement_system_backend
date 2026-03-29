import { getClient } from '../../config/db.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';

export const handleCalculateTermResults = catchAsync(async (req, res, next) => {
  const { term_id } = req.body.input;
  const school_id = req.body.session_variables['x-hasura-school-id'];

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. Calculate weighted scores for all students in the term
    // This looks at every exam, applies its weightage, and sums it up
    const calculationQuery = `
      WITH student_scores AS (
        SELECT 
          er.student_id,
          SUM(
            (er.score::float / es.max_score::float) * e.weightage
          ) as total_weighted_score
        FROM operations.examresults er
        JOIN operations.examsubjects es ON er.exam_subject_id = es.id
        JOIN operations.exams e ON es.exam_id = e.id
        WHERE e.term_id = $1 AND e.school_id = $2
        GROUP BY er.student_id
      ),
      ranked_scores AS (
        SELECT 
          student_id,
          total_weighted_score,
          RANK() OVER (ORDER BY total_weighted_score DESC) as class_rank
        FROM student_scores
      )
      INSERT INTO academic.term_summaries 
        (school_id, student_id, term_id, total_score, average_percentage, letter_grade, class_rank, is_finalized)
      SELECT 
        $2, 
        rs.student_id, 
        $1, 
        rs.total_weighted_score, 
        rs.total_weighted_score, -- Assuming average is based on 100 max weight
        CASE 
          WHEN rs.total_weighted_score >= 90 THEN 'A+'
          WHEN rs.total_weighted_score >= 80 THEN 'A'
          WHEN rs.total_weighted_score >= 70 THEN 'B'
          WHEN rs.total_weighted_score >= 50 THEN 'C'
          ELSE 'F'
        END,
        rs.class_rank,
        true
      FROM ranked_scores rs
      ON CONFLICT (student_id, term_id) 
      DO UPDATE SET 
        total_score = EXCLUDED.total_score,
        average_percentage = EXCLUDED.average_percentage,
        letter_grade = EXCLUDED.letter_grade,
        class_rank = EXCLUDED.class_rank,
        is_finalized = true
      RETURNING student_id;
    `;

    const result = await client.query(calculationQuery, [term_id, school_id]);

    await client.query('COMMIT');

    res.json({
      processed_students: result.rowCount,
      message: `Results finalized and ranked for ${result.rowCount} students.`
    });

  } catch (err) {
    await client.query('ROLLBACK');
    return next(new AppError(err.message, 400));
  } finally {
    client.release();
  }
});