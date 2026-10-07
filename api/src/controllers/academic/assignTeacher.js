import { query } from '../../config/db.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';

export const assignTeacher = catchAsync(async (req, res, next) => {
  const { teacher_user_id, subject_id, section_id } = req.body.input.object;
  const school_id = req.body.session_variables['x-hasura-school-id'];

  // High-scale Security: Verify all IDs belong to the school
  const check = await query(
    `SELECT 
      (SELECT count(*) FROM identity.users WHERE id = $1 AND school_id = $4) as user_ok,
      (SELECT count(*) FROM academic.subjects WHERE id = $2 AND school_id = $4) as subject_ok,
      (SELECT count(*) FROM academic.sections WHERE id = $3 AND school_id = $4) as section_ok`,
    [teacher_user_id, subject_id, section_id, school_id]
  );

  const { user_ok, subject_ok, section_ok } = check.rows[0];
  if (user_ok == 0 || subject_ok == 0 || section_ok == 0) {
    return next(new AppError('Invalid data: One or more entities do not belong to your school.', 400));
  }

  const result = await query(
    `INSERT INTO academic.teacherassignments (teacher_id, subject_id, section_id)
     VALUES ($1, $2, $3) RETURNING id`,
    [teacher_user_id, subject_id, section_id]
  );

  res.json({ assignment_id: result.rows[0].id });
});