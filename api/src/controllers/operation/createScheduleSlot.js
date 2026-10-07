import { getClient } from '../../config/db.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';

export const handleCreateScheduleSlot = catchAsync(async (req, res, next) => {
  const { section_id, subject_id, teacher_id, day_id, start_time, end_time, room_number } = req.body.input.input;
  const school_id = req.body.session_variables['x-hasura-school-id'];
  console.log('Creating schedule slot with:', { section_id, subject_id, teacher_id, day_id, start_time, end_time, room_number });

  const client = await getClient();
  try {
    // 1. Check for Teacher Conflict
    const teacherConflict = await client.query(
      `SELECT id FROM operations.schedules 
       WHERE teacher_id = $1 AND day_id = $2 AND school_id = $3
       AND (start_time, end_time) OVERLAPS ($4::time, $5::time)`,
      [teacher_id, day_id, school_id, start_time, end_time]
    );

    if (teacherConflict.rows.length > 0) {
      return next(new AppError('This teacher is already assigned to another class during this time.', 400));
    }

    // 2. Check for Section (Classroom) Conflict
    const sectionConflict = await client.query(
      `SELECT id FROM operations.schedules 
       WHERE section_id = $1 AND day_id = $2 AND school_id = $3
       AND (start_time, end_time) OVERLAPS ($4::time, $5::time)`,
      [section_id, day_id, school_id, start_time, end_time]
    );

    if (sectionConflict.rows.length > 0) {
      return next(new AppError('This class already has a subject scheduled for this time.', 400));
    }

    // 3. Insert the slot
    const result = await client.query(
      `INSERT INTO operations.schedules (school_id, section_id, subject_id, teacher_id, day_id, start_time, end_time, room_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [school_id, section_id, subject_id, teacher_id, day_id, start_time, end_time, room_number]
    );

    res.json({ id: result.rows[0].id, status: "scheduled" });

  } catch (err) {
    return next(new AppError(err.message, 400));
  } finally {
    client.release();
  }
});