import { query } from '../../config/db.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';

export const createTerm = catchAsync(async (req, res, next) => {
  // 1. Extract from Hasura body
  const { input, session_variables } = req.body;
  const { academic_year_id, name, start_date, end_date } = input.object;
  
  // 2. High-Scale Security: Pull school_id from Session
  const school_id = session_variables['x-hasura-school-id'];

  if (!school_id) {
    return next(new AppError('Unauthorized: School context missing.', 401));
  }

  // 3. Multi-tenant Validation: Verify Year belongs to this school
  const yearRes = await query(
    'SELECT start_date, end_date FROM academic.academicyears WHERE id = $1 AND school_id = $2',
    [academic_year_id, school_id]
  );

  if (yearRes.rows.length === 0) {
    return next(new AppError('Academic Year not found or access denied.', 404));
  }

  const year = yearRes.rows[0];

  // 4. Date range validation
  if (new Date(start_date) < new Date(year.start_date) || new Date(end_date) > new Date(year.end_date)) {
    return next(new AppError(`Term dates must be between ${year.start_date} and ${year.end_date}`, 400));
  }

  // 5. Database Operation
  const result = await query(
    `INSERT INTO academic.terms (academic_year_id, name, start_date, end_date)
     VALUES ($1, $2, $3, $4) RETURNING id, name, academic_year_id`,
    [academic_year_id, name, start_date, end_date]
  );

  console.log('DB Result:', result.rows[0]);

  const term = result.rows[0];

  // 6. Explicitly map to match Hasura Action Output Type exactly
  res.json({
    id: term.id,
    name: term.name,
    academic_year_id: term.academic_year_id // Ensure this matches the Action Output field name
  });
});