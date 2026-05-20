import { query } from '../../config/db.js';

/**
 * @param {string} schoolId
 * @param {object} candidate
 * @returns {Promise<{ hasConflict: boolean, conflicts: object[] }>}
 */
export const checkScheduleConflicts = async (schoolId, candidate) => {
  const {
    class_id, room, start_time, end_time, invigilator_id, exclude_schedule_id,
  } = candidate;

  const conflicts = [];
  if (!start_time || !end_time) return { hasConflict: false, conflicts: [] };

  const base = [schoolId, start_time, end_time];
  const excludeSql = exclude_schedule_id ? ' AND esch.id <> $4' : '';
  const baseWithExclude = exclude_schedule_id ? [...base, exclude_schedule_id] : base;

  if (room) {
    const roomClash = await query(
      `SELECT esch.id, esch.room, e.name AS exam_name, c.name AS class_name
       FROM operations.exam_schedules esch
       JOIN operations.exams e ON e.id = esch.exam_id
       JOIN academic.classes c ON c.id = esch.class_id
       WHERE esch.school_id = $1 AND COALESCE(esch.is_deleted, false) = false
         AND esch.status <> 'cancelled'
         AND TRIM(esch.room) = TRIM($${exclude_schedule_id ? 5 : 4})
         AND esch.start_time < $3 AND esch.end_time > $2
         ${excludeSql}`,
      exclude_schedule_id ? [...baseWithExclude, room] : [...base, room]
    );
    for (const row of roomClash.rows) {
      conflicts.push({
        type: 'room_double_booking',
        message: `Room "${room}" is already used by ${row.exam_name} (${row.class_name}).`,
        schedule_id: row.id,
      });
    }
  }

  const classDayClash = await query(
    `SELECT esch.id, e.name AS exam_name, sub.name AS subject_name
     FROM operations.exam_schedules esch
     JOIN operations.exams e ON e.id = esch.exam_id
     JOIN academic.subjects sub ON sub.id = esch.subject_id
     WHERE esch.school_id = $1 AND esch.class_id = $${exclude_schedule_id ? 5 : 4}
       AND COALESCE(esch.is_deleted, false) = false
       AND esch.status <> 'cancelled'
       AND DATE(esch.start_time) = DATE($2::timestamptz)
       ${excludeSql}`,
    exclude_schedule_id
      ? [schoolId, start_time, end_time, exclude_schedule_id, class_id]
      : [schoolId, start_time, end_time, class_id]
  );

  for (const row of classDayClash.rows) {
    conflicts.push({
      type: 'class_overload',
      message: `Class already has exam "${row.exam_name}" (${row.subject_name}) on this date.`,
      schedule_id: row.id,
    });
  }

  if (invigilator_id) {
    const invigClash = await query(
      `SELECT esch.id, e.name AS exam_name
       FROM operations.exam_schedules esch
       JOIN operations.exams e ON e.id = esch.exam_id
       WHERE esch.school_id = $1 AND esch.invigilator_id = $${exclude_schedule_id ? 5 : 4}
         AND COALESCE(esch.is_deleted, false) = false
         AND esch.status <> 'cancelled'
         AND esch.start_time < $3 AND esch.end_time > $2
         ${excludeSql}`,
      exclude_schedule_id
        ? [schoolId, start_time, end_time, exclude_schedule_id, invigilator_id]
        : [schoolId, start_time, end_time, invigilator_id]
    );
    for (const row of invigClash.rows) {
      conflicts.push({
        type: 'invigilator_conflict',
        message: `Invigilator is already assigned to "${row.exam_name}".`,
        schedule_id: row.id,
      });
    }
  }

  return { hasConflict: conflicts.length > 0, conflicts };
};
