import { query } from '../../config/db.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';

export const createSubject = catchAsync(async (req, res, next) => {
  const { name } = req.body.input;
  const school_id = req.body.session_variables['x-hasura-school-id'];

  const result = await query(
    `INSERT INTO academic.subjects (school_id, name) VALUES ($1, $2) RETURNING id, name`,
    [school_id, name]
  );

  res.json(result.rows[0]);
});