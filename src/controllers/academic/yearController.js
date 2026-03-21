import { query } from '../../config/db.js';
import catchAsync from '../../utils/catchAsync.js';

export const createAcademicYear = catchAsync(async (req, res, next) => {
const { input, session_variables } = req.body;
  const { name, start_date, end_date } = input.object;

  // 2. High-Scale Multi-Tenancy: Get school_id from Hasura Session
  const school_id = session_variables['x-hasura-school-id'];

  if (!school_id) {
    return next(new AppError('Unauthorized: School context missing.', 401));
  }

  // 3. Database Operation
  const result = await query(
    `INSERT INTO academic.academicyears (school_id, name, start_date, end_date, status)
     VALUES ($1, $2, $3, $4, 'active') 
     RETURNING id, name, status`,
    [school_id, name, start_date, end_date]
  );

  // 4. Return response matching AcademicYearOutput
  res.json({
    id: result.rows[0].id,
    name: result.rows[0].name,
    status: result.rows[0].status
  });
});