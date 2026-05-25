import { query } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { ATTENDANCE_TABLE } from '../utils/attendanceTable.js';

export const getStudentAnalytics = async (schoolId, studentId) => {
  const student = await query(
    `SELECT id FROM student.students WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL`,
    [studentId, schoolId]
  );
  if (!student.rows[0]) throw new AppError('Student not found.', 404, ERROR_CODES.NOT_FOUND);

  const [attendanceTrend, gradeTrend, attendanceRate, subjectPerformance] = await Promise.all([
    query(
      `SELECT date_trunc('month', a.date)::date AS month,
              COUNT(*) FILTER (WHERE a.status = 'present')::int AS present,
              COUNT(*) FILTER (WHERE a.status = 'absent')::int AS absent,
              COUNT(*) FILTER (WHERE a.status = 'late')::int AS late,
              COUNT(*)::int AS total
       FROM ${ATTENDANCE_TABLE} a
       WHERE a.student_id = $1 AND a.school_id = $2 AND a.date >= (CURRENT_DATE - INTERVAL '6 months')
       GROUP BY 1 ORDER BY 1`,
      [studentId, schoolId]
    ),
    query(
      `SELECT e.name AS exam_name, er.score, COALESCE(er.entered_at, er.updated_at)::date AS recorded_at, sub.name AS subject_name
       FROM operations.examresults er
       JOIN operations.exams e ON e.id = er.exam_id
       LEFT JOIN academic.subjects sub ON sub.id = e.subject_id
       WHERE er.student_id = $1
       ORDER BY COALESCE(er.entered_at, er.updated_at) DESC LIMIT 24`,
      [studentId]
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'present')::int AS present,
         COUNT(*)::int AS total
       FROM ${ATTENDANCE_TABLE} WHERE student_id = $1 AND school_id = $2`,
      [studentId, schoolId]
    ),
    query(
      `SELECT sub.name AS subject, AVG(er.score)::numeric(5,2) AS avg_score, COUNT(*)::int AS attempts
       FROM operations.examresults er
       JOIN operations.exams e ON e.id = er.exam_id
       LEFT JOIN academic.subjects sub ON sub.id = e.subject_id
       WHERE er.student_id = $1
       GROUP BY sub.name ORDER BY avg_score DESC NULLS LAST`,
      [studentId]
    ).catch(() => ({ rows: [] })),
  ]);

  const total = attendanceRate.rows[0]?.total || 0;
  const present = attendanceRate.rows[0]?.present || 0;

  return {
    attendance_trend: attendanceTrend.rows.map((r) => ({
      month: r.month,
      present: r.present,
      absent: r.absent,
      late: r.late,
      total: r.total,
      rate: r.total ? Math.round((r.present / r.total) * 100) : 0,
    })),
    grade_trend: gradeTrend.rows,
    attendance_rate: total ? Math.round((present / total) * 100) : null,
    subject_performance: subjectPerformance.rows,
    risk_flags: {
      low_attendance: total > 10 && present / total < 0.75,
      no_recent_exams: gradeTrend.rows.length === 0,
    },
  };
};
