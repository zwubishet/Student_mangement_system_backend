import { query } from '../../config/db.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';

export const handleCreateExamAction = catchAsync(async (req, res, next) => {
  const { name, term_id, weightage } = req.body.input.object;
  const school_id = req.body.session_variables['x-hasura-school-id'];

  if (!school_id) return next(new AppError('Unauthorized: School ID missing', 401));

  // 1. DEEP SECURITY CHECK: Term -> AcademicYear -> School
  // This mimics your GraphQL filter: academicyear: { school_id: { _eq: school_id } }
  const termCheck = await query(
    `SELECT t.id 
     FROM academic.terms t
     JOIN academic.academicyears ay ON t.academic_year_id = ay.id
     WHERE t.id = $1 AND ay.school_id = $2`,
    [term_id, school_id]
  );

  if (termCheck.rows.length === 0) {
    return next(new AppError('Unauthorized: This term does not belong to your school context.', 403));
  }

  // 2. LOGIC VALIDATION: Check total weightage for the term
  const totalWeightRes = await query(
    `SELECT SUM(weightage) as total FROM operations.exams 
     WHERE term_id = $1 AND school_id = $2`,
    [term_id, school_id]
  );

  const currentTotal = parseInt(totalWeightRes.rows[0].total || 0);
  if (currentTotal + weightage > 100) {
    return next(new AppError(`Weightage Error: Term total is ${currentTotal}%. Adding ${weightage}% exceeds 100%.`, 400));
  }

  // 3. EXECUTION: Insert the Exam into operations schema
  const result = await query(
    `INSERT INTO operations.exams (school_id, name, term_id, weightage) 
     VALUES ($1, $2, $3, $4) RETURNING id, name`,
    [school_id, name, term_id, weightage]
  );

  res.json(result.rows[0]);
});