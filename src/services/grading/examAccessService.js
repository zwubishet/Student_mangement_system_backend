import { query } from '../../config/db.js';
import { AppError, ERROR_CODES } from '../../utils/errors.js';

/** Teacher must be assigned to section+subject for this schedule. */
export const assertTeacherScheduleAccess = async (schoolId, teacherUserId, examId, scheduleId) => {
  const check = await query(
    `SELECT 1
     FROM operations.exam_schedules esch
     JOIN academic.classes c ON c.id = esch.class_id
     JOIN academic.teacherassignments ta
       ON ta.section_id = c.section_id AND ta.subject_id = esch.subject_id AND ta.teacher_id = $1
     WHERE esch.id = $2 AND esch.exam_id = $3 AND esch.school_id = $4`,
    [teacherUserId, scheduleId, examId, schoolId]
  );
  if (!check.rows[0]) {
    throw new AppError('You are not assigned to mark this exam schedule.', 403, ERROR_CODES.FORBIDDEN);
  }
};

/** Teacher must have at least one assigned schedule on this exam. */
export const assertTeacherExamAccess = async (schoolId, teacherUserId, examId) => {
  const check = await query(
    `SELECT 1
     FROM operations.exam_schedules esch
     JOIN academic.classes c ON c.id = esch.class_id
     JOIN academic.teacherassignments ta
       ON ta.section_id = c.section_id AND ta.subject_id = esch.subject_id AND ta.teacher_id = $1
     WHERE esch.exam_id = $2 AND esch.school_id = $3
     LIMIT 1`,
    [teacherUserId, examId, schoolId]
  );
  if (!check.rows[0]) {
    throw new AppError('You do not have access to this exam.', 403, ERROR_CODES.FORBIDDEN);
  }
};

/** SQL fragment: restrict exams list to teacher assignments. */
export const teacherExamExistsClause = (teacherParamIndex) => `
  EXISTS (
    SELECT 1 FROM operations.exam_schedules esch_t
    JOIN academic.classes c_t ON c_t.id = esch_t.class_id
    JOIN academic.teacherassignments ta_t
      ON ta_t.section_id = c_t.section_id AND ta_t.subject_id = esch_t.subject_id
      AND ta_t.teacher_id = $${teacherParamIndex}
    WHERE esch_t.exam_id = e.id AND esch_t.school_id = e.school_id
  )
`;

/** Filter schedule rows for a teacher (in-memory after query). */
export const filterSchedulesForTeacher = async (schoolId, teacherUserId, schedules) => {
  if (!schedules?.length) return [];
  const allowed = await query(
    `SELECT esch.id
     FROM operations.exam_schedules esch
     JOIN academic.classes c ON c.id = esch.class_id
     JOIN academic.teacherassignments ta
       ON ta.section_id = c.section_id AND ta.subject_id = esch.subject_id AND ta.teacher_id = $1
     WHERE esch.school_id = $2 AND esch.id = ANY($3::uuid[])`,
    [teacherUserId, schoolId, schedules.map((s) => s.id)]
  );
  const ids = new Set(allowed.rows.map((r) => r.id));
  return schedules.filter((s) => ids.has(s.id));
};

export const guardTeacherExamRoute = async (schoolId, role, userId, examId, scheduleId = null) => {
  if (role !== 'TEACHER') return;
  if (scheduleId) {
    await assertTeacherScheduleAccess(schoolId, userId, examId, scheduleId);
  } else {
    await assertTeacherExamAccess(schoolId, userId, examId);
  }
};
