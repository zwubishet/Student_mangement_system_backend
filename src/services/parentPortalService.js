import { query } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { ATTENDANCE_TABLE } from '../utils/attendanceTable.js';

export const getParentContext = async (schoolId, userId) => {
  const parent = await query(
    `SELECT p.* FROM academic.parents p WHERE p.user_id = $1 AND p.school_id = $2`,
    [userId, schoolId]
  );
  if (!parent.rows[0]) throw new AppError('Parent profile not found.', 404, ERROR_CODES.NOT_FOUND);
  return parent.rows[0];
};

export const getParentChildren = async (schoolId, userId) => {
  const parent = await getParentContext(schoolId, userId);
  const result = await query(
    `SELECT s.id, s.first_name, s.last_name, s.admission_number, s.gender,
            g.name AS grade_name, sec.name AS section_name, se.status AS enrollment_status
     FROM academic.parentstudents ps
     JOIN student.students s ON s.id = ps.student_id AND s.deleted_at IS NULL
     LEFT JOIN student.studentenrollments se ON se.student_id = s.id AND se.status = 'active'
     LEFT JOIN academic.sections sec ON sec.id = se.section_id
     LEFT JOIN academic.classes c ON c.section_id = sec.id AND c.academic_year_id = se.academic_year_id
     LEFT JOIN academic.grades g ON g.id = c.grade_id
     WHERE ps.parent_id = $1 AND ps.school_id = $2
     ORDER BY s.last_name, s.first_name`,
    [parent.id, schoolId]
  );
  return { parent: parent, children: result.rows };
};

export const getParentChildDetail = async (schoolId, userId, studentId) => {
  const parent = await getParentContext(schoolId, userId);
  const access = await query(
    `SELECT 1 FROM academic.parentstudents WHERE parent_id = $1 AND student_id = $2 AND school_id = $3`,
    [parent.id, studentId, schoolId]
  );
  if (!access.rows[0]) throw new AppError('Access denied.', 403, ERROR_CODES.INVALID_OPERATION);

  const [student, attendance, exams] = await Promise.all([
    query(
      `SELECT s.id, s.first_name, s.last_name, s.admission_number, u.email
       FROM student.students s
       JOIN identity.users u ON u.id = s.user_id
       WHERE s.id = $1`,
      [studentId]
    ),
    query(
      `SELECT status, COUNT(*)::int AS count FROM ${ATTENDANCE_TABLE}
       WHERE student_id = $1 AND school_id = $2 AND date >= (CURRENT_DATE - INTERVAL '30 days')
       GROUP BY status`,
      [studentId, schoolId]
    ),
    query(
      `SELECT e.name AS exam_name, er.score, er.created_at::date AS recorded_at
       FROM operations.examresults er
       JOIN operations.exams e ON e.id = er.exam_id
       WHERE er.student_id = $1 ORDER BY er.created_at DESC LIMIT 10`,
      [studentId]
    ).catch(() => ({ rows: [] })),
  ]);

  const att = attendance.rows;
  const total = att.reduce((s, r) => s + r.count, 0);
  const present = att.find((r) => r.status === 'present')?.count || 0;

  return {
    student: student.rows[0],
    attendance_summary: { total, present, rate: total ? Math.round((present / total) * 100) : null },
    recent_exams: exams.rows,
  };
};
