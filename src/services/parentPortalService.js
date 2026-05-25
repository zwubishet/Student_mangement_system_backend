import { query } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { hashPassword, comparePasswords } from '../utils/auth.js';
import { ATTENDANCE_TABLE } from '../utils/attendanceTable.js';
import { getStudentGradeReport, getStudentRecentExams } from './grading/gradingReadService.js';
import { buildStudentReportCardPdf } from './reportCardPdfService.js';

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
      `SELECT s.id, s.first_name, s.last_name, s.admission_number, u.email,
              g.name AS grade_name, sec.name AS section_name
       FROM student.students s
       JOIN identity.users u ON u.id = s.user_id
       LEFT JOIN student.studentenrollments se ON se.student_id = s.id AND se.status = 'active'
       LEFT JOIN academic.sections sec ON sec.id = se.section_id
       LEFT JOIN academic.classes c ON c.section_id = sec.id AND c.academic_year_id = se.academic_year_id
       LEFT JOIN academic.grades g ON g.id = c.grade_id
       WHERE s.id = $1`,
      [studentId]
    ),
    query(
      `SELECT status, COUNT(*)::int AS count FROM ${ATTENDANCE_TABLE}
       WHERE student_id = $1 AND school_id = $2 AND date >= (CURRENT_DATE - INTERVAL '30 days')
       GROUP BY status`,
      [studentId, schoolId]
    ),
    getStudentRecentExams(schoolId, studentId, 8).catch(() => []),
    query(
      `SELECT i.id, i.academic_year, i.term, i.amount, i.subtotal, i.discount_amount,
              i.total_paid, i.status, i.due_date,
              GREATEST(i.amount - COALESCE(i.total_paid, pt.paid, 0), 0)::numeric(12,2) AS balance,
              COALESCE(
                json_agg(
                  json_build_object('name', ii.name, 'amount', ii.amount)
                  ORDER BY ii.name
                ) FILTER (WHERE ii.id IS NOT NULL),
                '[]'::json
              ) AS line_items
       FROM finance.invoices i
       LEFT JOIN finance.invoiceitems ii ON ii.invoice_id = i.id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(amount), 0)::numeric(12,2) AS paid
         FROM finance.payments p
         WHERE p.invoice_id = i.id AND p.school_id = i.school_id AND p.status = 'succeeded'
       ) pt ON true
       WHERE i.student_id = $1 AND i.school_id = $2
       GROUP BY i.id, pt.paid
       ORDER BY i.created_at DESC LIMIT 12`,
      [studentId, schoolId]
    ).catch(() => ({ rows: [] })),
  ]);

  const att = attendance.rows;
  const total = att.reduce((s, r) => s + r.count, 0);
  const present = att.find((r) => r.status === 'present')?.count || 0;

  return {
    student: student.rows[0],
    attendance_summary: { total, present, rate: total ? Math.round((present / total) * 100) : null },
    recent_exams: exams,
    invoices: invoices.rows,
  };
};

export const getParentChildGrades = async (schoolId, userId, studentId, filters = {}) => {
  const parent = await getParentContext(schoolId, userId);
  const access = await query(
    `SELECT 1 FROM academic.parentstudents WHERE parent_id = $1 AND student_id = $2 AND school_id = $3`,
    [parent.id, studentId, schoolId]
  );
  if (!access.rows[0]) throw new AppError('Access denied.', 403, ERROR_CODES.INVALID_OPERATION);
  return getStudentGradeReport(schoolId, studentId, filters);
};

export const getParentChildReportCardPdf = async (schoolId, userId, studentId, filters = {}) => {
  const parent = await getParentContext(schoolId, userId);
  const access = await query(
    `SELECT 1 FROM academic.parentstudents WHERE parent_id = $1 AND student_id = $2 AND school_id = $3`,
    [parent.id, studentId, schoolId]
  );
  if (!access.rows[0]) throw new AppError('Access denied.', 403, ERROR_CODES.INVALID_OPERATION);
  return buildStudentReportCardPdf(schoolId, studentId, filters);
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
