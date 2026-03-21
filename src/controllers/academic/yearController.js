import { query } from '../../config/db.js';
import catchAsync from '../../utils/catchAsync.js';

export const createAcademicYear = catchAsync(async (req, res, next) => {
  const { name, start_date, end_date } = req.body;
  const school_id = req.user.schoolId; // Securely pulled from the token

  const newYear = await query(
    `INSERT INTO academic.academicyears (school_id, name, start_date, end_date)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [school_id, name, start_date, end_date]
  );

  res.status(201).json({
    status: 'success',
    data: {
      year: newYear.rows[0]
    }
  });
});