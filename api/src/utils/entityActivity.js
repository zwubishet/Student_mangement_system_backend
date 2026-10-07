import { query } from '../config/db.js';

export const logStudentActivity = async ({ schoolId, studentId, actorId, action, meta = {} }) => {
  try {
    await query(
      `INSERT INTO student.student_activity_logs (school_id, student_id, actor_id, action, meta)
       VALUES ($1, $2, $3, $4, $5)`,
      [schoolId, studentId, actorId, action, JSON.stringify(meta)]
    );
  } catch {
    /* non-blocking */
  }
};

export const logTeacherActivity = async ({ schoolId, teacherId, actorId, action, meta = {} }) => {
  try {
    await query(
      `INSERT INTO academic.teacher_activity_logs (school_id, teacher_id, actor_id, action, meta)
       VALUES ($1, $2, $3, $4, $5)`,
      [schoolId, teacherId, actorId, action, JSON.stringify(meta)]
    );
  } catch {
    /* non-blocking */
  }
};
