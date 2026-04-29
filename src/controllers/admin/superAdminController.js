import { query } from '../../config/db.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';

export const listSchools = catchAsync(async (req, res, next) => {
  const result = await query(
    `SELECT s.id, s.name, s.school_address, s.status, s.created_at,
            COUNT(DISTINCT u.id) as user_count
     FROM tenancy.schools s
     LEFT JOIN identity.users u ON u.school_id = s.id
     GROUP BY s.id ORDER BY s.created_at DESC`
  );
  res.json({ schools: result.rows });
});

export const toggleSchoolStatus = catchAsync(async (req, res, next) => {
  const { input } = req.body;
  const { school_id, status } = input.object;

  if (!['active', 'inactive', 'suspended'].includes(status)) {
    return next(new AppError('Invalid status value', 400));
  }

  const result = await query(
    `UPDATE tenancy.schools SET status = $1 WHERE id = $2 RETURNING id, name, status`,
    [status, school_id]
  );

  if (result.rows.length === 0) return next(new AppError('School not found', 404));
  res.json(result.rows[0]);
});
