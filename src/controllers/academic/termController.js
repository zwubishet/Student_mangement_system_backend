import { query } from '../../config/db.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';

export const createTerm = catchAsync(async (req, res, next) => {
  const { academic_year_id, name, start_date, end_date } = req.body;
  const school_id = req.user.schoolId;

  // 1. Verify the Academic Year exists and belongs to this school
  const yearRes = await query(
    'SELECT start_date, end_date FROM academic.academicyears WHERE id = $1 AND school_id = $2',
    [academic_year_id, school_id]
  );

  if (yearRes.rows.length === 0) {
    return next(new AppError('Academic Year not found or access denied.', 404));
  }

  const year = yearRes.rows[0];

  // 2. High-Scale Validation: Ensure Term dates are within Year dates
  if (new Date(start_date) < new Date(year.start_date) || new Date(end_date) > new Date(year.end_date)) {
    return next(new AppError('Term dates must be within the Academic Year range.', 400));
  }

  // 3. Insert the Term
  const newTerm = await query(
    `INSERT INTO academic.terms (academic_year_id, name, start_date, end_date)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [academic_year_id, name, start_date, end_date]
  );

  res.status(201).json({
    status: 'success',
    data: { term: newTerm.rows[0] }
  });
});