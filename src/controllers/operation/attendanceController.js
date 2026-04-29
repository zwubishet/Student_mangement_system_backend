import { getClient, query } from '../../config/db.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';

// Mark attendance for a list of students in a section
export const markAttendance = catchAsync(async (req, res, next) => {
  const { input, session_variables } = req.body;
  const { section_id, date, records } = input.object;
  // records: [{ student_id, status }] where status = 'present'|'absent'|'late'

  const school_id = session_variables['x-hasura-school-id'];
  if (!school_id) return next(new AppError('Unauthorized', 401));

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const results = await Promise.all(
      records.map(({ student_id, status }) =>
        client.query(
          `INSERT INTO student.attendance (school_id, section_id, student_id, date, status)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (section_id, student_id, date)
           DO UPDATE SET status = EXCLUDED.status
           RETURNING id`,
          [school_id, section_id, student_id, date, status]
        )
      )
    );

    await client.query('COMMIT');
    res.json({ marked: results.length, date, section_id });
  } catch (err) {
    await client.query('ROLLBACK');
    return next(new AppError(err.message, 500));
  } finally {
    client.release();
  }
});

// Get attendance for a section on a date
export const getAttendance = catchAsync(async (req, res, next) => {
  const { input, session_variables } = req.body;
  const { section_id, date } = input.object;
  const school_id = session_variables['x-hasura-school-id'];
  if (!school_id) return next(new AppError('Unauthorized', 401));

  const result = await query(
    `SELECT a.student_id, a.status, s.first_name, s.last_name
     FROM student.attendance a
     JOIN student.students s ON s.id = a.student_id
     WHERE a.section_id = $1 AND a.date = $2 AND a.school_id = $3`,
    [section_id, date, school_id]
  );

  res.json({ records: result.rows });
});
