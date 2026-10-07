import { query } from '../../config/db.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';

export const createSubject = catchAsync(async (req, res, next) => {
  const { name } = req.body.input;
  const school_id = req.body.session_variables['x-hasura-school-id'];

  if (!school_id) return next(new AppError('School context missing', 401));

  // 1. Check if subject already exists for this school (Case-Insensitive)
  const existing = await query(
    `SELECT id FROM academic.subjects WHERE school_id = $1 AND LOWER(name) = LOWER($2)`,
    [school_id, name]
  );

  if (existing.rows.length > 0) {
    return next(new AppError('A subject with this name already exists.', 400));
  }

  // 2. Insert new subject
  const result = await query(
    `INSERT INTO academic.subjects (school_id, name) 
     VALUES ($1, $2) 
     RETURNING id, name`,
    [school_id, name]
  );

  res.json({
    id: result.rows[0].id,
    name: result.rows[0].name
  });
});