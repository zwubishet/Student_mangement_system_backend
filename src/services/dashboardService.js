import { query } from '../config/db.js';

export const getDashboardStats = async (schoolId) => {
  const [students, teachers, classes, exams, activeEnrollments] = await Promise.all([
    query(`SELECT COUNT(*)::int AS count FROM student.students WHERE school_id = $1`, [schoolId]),
    query(`SELECT COUNT(*)::int AS count FROM academic.teachers WHERE school_id = $1`, [schoolId]),
    query(`SELECT COUNT(*)::int AS count FROM academic.classes WHERE school_id = $1`, [schoolId]),
    query(`SELECT COUNT(*)::int AS count FROM operations.exams WHERE school_id = $1`, [schoolId]),
    query(
      `SELECT COUNT(*)::int AS count 
       FROM student.studentenrollments 
       WHERE school_id = $1 AND status = 'active'`,
      [schoolId]
    ),
  ]);

  return {
    student_count: students.rows[0].count,
    teacher_count: teachers.rows[0].count,
    class_count: classes.rows[0].count,
    exam_count: exams.rows[0].count,
    active_enrollments: activeEnrollments.rows[0].count,
  };
};

export const getRecentActivity = async (schoolId, limit = 10) => {
  const result = await query(
    `SELECT 
       al.action, al.entity, al.entity_id, al.created_at,
       u.first_name, u.last_name
     FROM identity.audit_logs al
     LEFT JOIN identity.users u ON al.user_id = u.id
     WHERE al.school_id = $1
     ORDER BY al.created_at DESC
     LIMIT $2`,
    [schoolId, limit]
  );
  return result.rows;
};
