import { query } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { hashPassword, comparePasswords } from '../utils/auth.js';
import { ATTENDANCE_TABLE } from '../utils/attendanceTable.js';

export const getParentContext = async (schoolId, userId) => {
  const parent = await query(
    `SELECT p.*, u.email AS login_email, u.first_name AS user_first_name, u.last_name AS user_last_name
     FROM academic.parents p
     JOIN identity.users u ON u.id = p.user_id
     WHERE p.user_id = $1 AND p.school_id = $2`,
    [userId, schoolId]
  );
  if (!parent.rows[0]) throw new AppError('Parent profile not found.', 404, ERROR_CODES.NOT_FOUND);
  return parent.rows[0];
};

export const getParentChildren = async (schoolId, userId) => {
  const parent = await getParentContext(schoolId, userId);
  const result = await query(
    `SELECT s.id, s.first_name, s.last_name, s.admission_number, s.gender,
            g.name AS grade_name, sec.name AS section_name, se.status AS enrollment_status,
            COALESCE(fee.open_balance, 0)::numeric(12,2) AS fee_balance
     FROM academic.parentstudents ps
     JOIN student.students s ON s.id = ps.student_id AND s.deleted_at IS NULL
     LEFT JOIN student.studentenrollments se ON se.student_id = s.id AND se.status = 'active'
     LEFT JOIN academic.sections sec ON sec.id = se.section_id
     LEFT JOIN academic.classes c ON c.section_id = sec.id AND c.academic_year_id = se.academic_year_id
     LEFT JOIN academic.grades g ON g.id = c.grade_id
     LEFT JOIN LATERAL (
       SELECT SUM(GREATEST(i.amount - COALESCE(i.total_paid, 0), 0))::numeric(12,2) AS open_balance
       FROM finance.invoices i
       WHERE i.student_id = s.id AND i.school_id = $2
         AND i.status IN ('pending', 'partial', 'unpaid')
     ) fee ON true
     WHERE ps.parent_id = $1 AND ps.school_id = $2
     ORDER BY s.last_name, s.first_name`,
    [parent.id, schoolId]
  );
  return { parent, children: result.rows };
};

export const getParentChildDetail = async (schoolId, userId, studentId) => {
  const parent = await getParentContext(schoolId, userId);
  const access = await query(
    `SELECT 1 FROM academic.parentstudents WHERE parent_id = $1 AND student_id = $2 AND school_id = $3`,
    [parent.id, studentId, schoolId]
  );
  if (!access.rows[0]) throw new AppError('Access denied.', 403, ERROR_CODES.INVALID_OPERATION);

  const [student, attendance, exams, invoices] = await Promise.all([
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
    query(
      `SELECT id, academic_year, term, amount, total_paid, status, due_date,
              GREATEST(amount - COALESCE(total_paid, 0), 0)::numeric(12,2) AS balance
       FROM finance.invoices
       WHERE student_id = $1 AND school_id = $2
       ORDER BY created_at DESC LIMIT 8`,
      [studentId, schoolId]
    ).catch(() => ({ rows: [] })),
  ]);

  const att = attendance.rows;
  const total = att.reduce((s, r) => s + r.count, 0);
  const present = att.find((r) => r.status === 'present')?.count || 0;

  return {
    student: student.rows[0],
    attendance_summary: { total, present, rate: total ? Math.round((present / total) * 100) : null },
    recent_exams: exams.rows,
    invoices: invoices.rows,
  };
};

export const changeParentPassword = async (schoolId, userId, { current_password, new_password }) => {
  if (!new_password || String(new_password).length < 6) {
    throw new AppError('New password must be at least 6 characters.', 400, ERROR_CODES.VALIDATION_ERROR);
  }
  const user = await query(
    `SELECT u.id, u.password_hash FROM identity.users u
     JOIN academic.parents p ON p.user_id = u.id AND p.school_id = $2
     WHERE u.id = $1`,
    [userId, schoolId]
  );
  if (!user.rows[0]) throw new AppError('Parent account not found.', 404, ERROR_CODES.NOT_FOUND);

  const ok = await comparePasswords(current_password, user.rows[0].password_hash);
  if (!ok) throw new AppError('Current password is incorrect.', 401, ERROR_CODES.INVALID_CREDENTIALS);

  const hashed = await hashPassword(new_password);
  await query(`UPDATE identity.users SET password_hash = $2, updated_at = NOW() WHERE id = $1`, [userId, hashed]);
  return { updated: true };
};
