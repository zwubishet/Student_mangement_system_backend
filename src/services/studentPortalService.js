import { query } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { hashPassword, comparePasswords } from '../utils/auth.js';
import { ATTENDANCE_TABLE } from '../utils/attendanceTable.js';
import { listTimetableSlots } from './catalogService.js';
import { getStudentGradeReport, getStudentRecentExams } from './grading/gradingReadService.js';
import { buildStudentReportCardPdf } from './reportCardPdfService.js';

export const getStudentContext = async (schoolId, userId) => {
  const result = await query(
    `SELECT s.id, s.first_name, s.last_name, s.admission_number, s.gender, s.date_of_birth,
            u.email AS login_email, u.first_name AS user_first_name, u.last_name AS user_last_name,
            u.phone,
            se.id AS enrollment_id, se.section_id, se.academic_year_id, se.status AS enrollment_status,
            sec.name AS section_name, g.name AS grade_name, g.id AS grade_id,
            ay.name AS academic_year, ay.is_current AS year_is_current
     FROM student.students s
     JOIN identity.users u ON u.id = s.user_id
     LEFT JOIN student.studentenrollments se ON se.student_id = s.id AND se.school_id = s.school_id AND se.status = 'active'
     LEFT JOIN academic.sections sec ON sec.id = se.section_id
     LEFT JOIN academic.classes c ON c.section_id = sec.id AND c.academic_year_id = se.academic_year_id AND c.school_id = s.school_id
     LEFT JOIN academic.grades g ON g.id = COALESCE(c.grade_id, sec.grade_id)
     LEFT JOIN academic.academicyears ay ON ay.id = se.academic_year_id
     WHERE s.user_id = $1 AND s.school_id = $2 AND s.deleted_at IS NULL`,
    [userId, schoolId]
  );
  if (!result.rows[0]) {
    throw new AppError('Student profile not found.', 404, ERROR_CODES.NOT_FOUND);
  }
  return result.rows[0];
};

export const getStudentDashboard = async (schoolId, userId) => {
  const ctx = await getStudentContext(schoolId, userId);
  const studentId = ctx.id;

  const [
    attendance,
    fees,
    exams,
    announcements,
    computed,
    todaySlots,
  ] = await Promise.all([
    query(
      `SELECT status, COUNT(*)::int AS count FROM ${ATTENDANCE_TABLE}
       WHERE student_id = $1 AND school_id = $2 AND date >= (CURRENT_DATE - INTERVAL '30 days')
       GROUP BY status`,
      [studentId, schoolId]
    ),
    query(
      `SELECT COUNT(*)::int AS open_invoices,
              COALESCE(SUM(GREATEST(i.amount - COALESCE(i.total_paid, pt.paid, 0), 0)), 0)::numeric(12,2) AS balance
       FROM finance.invoices i
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(amount), 0)::numeric(12,2) AS paid
         FROM finance.payments p
         WHERE p.invoice_id = i.id AND p.school_id = i.school_id AND p.status = 'succeeded'
       ) pt ON true
       WHERE i.student_id = $1 AND i.school_id = $2
         AND i.status IN ('pending', 'partial', 'unpaid')`,
      [studentId, schoolId]
    ),
    query(
      `SELECT COUNT(*)::int AS total_results,
              ROUND(AVG(
                CASE WHEN esch.max_score > 0 AND NOT COALESCE(er.is_absent, false)
                  THEN (er.score::numeric / esch.max_score) * 100 ELSE NULL END
              ), 1)::numeric AS avg_pct
       FROM operations.examresults er
       JOIN operations.exam_schedules esch ON esch.id = er.schedule_id
       JOIN operations.exams e ON e.id = er.exam_id
       WHERE er.student_id = $1 AND e.school_id = $2
         AND e.status = 'PUBLISHED' AND e.is_deleted = false
         AND COALESCE(er.is_deleted, false) = false
         AND er.mark_status IN ('verified', 'locked')`,
      [studentId, schoolId]
    ).catch(() => ({ rows: [{ total_results: 0, avg_pct: null }] })),
    query(
      `SELECT COUNT(*)::int AS unread_feed
       FROM operations.announcements a
       WHERE a.school_id = $1
         AND (a.target_role IN ('ALL', 'STUDENT') OR a.target_role IS NULL)
         AND (a.expires_at IS NULL OR a.expires_at > now())
         AND a.created_at >= (CURRENT_DATE - INTERVAL '14 days')`,
      [schoolId]
    ),
    query(
      `SELECT COUNT(*)::int AS term_results
       FROM operations.computed_results cr
       WHERE cr.student_id = $1 AND cr.school_id = $2`,
      [studentId, schoolId]
    ).catch(() => ({ rows: [{ term_results: 0 }] })),
    ctx.section_id && ctx.academic_year_id
      ? listTimetableSlots(schoolId, { section_id: ctx.section_id, academic_year_id: ctx.academic_year_id })
      : Promise.resolve([]),
  ]);

  const att = attendance.rows;
  const totalAtt = att.reduce((s, r) => s + r.count, 0);
  const present = att.find((r) => r.status === 'present')?.count || 0;

  const jsDay = new Date().getDay();
  const dbDay = jsDay === 0 ? 7 : jsDay;
  const todayPeriods = (todaySlots || []).filter((s) => Number(s.day_of_week) === dbDay);

  return {
    student: {
      id: ctx.id,
      first_name: ctx.first_name,
      last_name: ctx.last_name,
      admission_number: ctx.admission_number,
      grade_name: ctx.grade_name,
      section_name: ctx.section_name,
      academic_year: ctx.academic_year,
      enrollment_status: ctx.enrollment_status,
    },
    attendance_summary: {
      total: totalAtt,
      present,
      rate: totalAtt ? Math.round((present / totalAtt) * 100) : null,
    },
    fees_summary: {
      open_invoices: Number(fees.rows[0]?.open_invoices || 0),
      balance: Number(fees.rows[0]?.balance || 0),
    },
    academics_summary: {
      published_results: Number(exams.rows[0]?.total_results || 0),
      average_percent: exams.rows[0]?.avg_pct != null ? Number(exams.rows[0].avg_pct) : null,
      computed_results: Number(computed.rows[0]?.term_results || 0),
    },
    announcements_count: Number(announcements.rows[0]?.unread_feed || 0),
    today_timetable: todayPeriods.map((s) => ({
      period_number: s.period_number,
      subject_name: s.subject_name,
      start_time: s.start_time,
      end_time: s.end_time,
      teacher_name: [s.teacher_first_name, s.teacher_last_name].filter(Boolean).join(' '),
    })),
  };
};

export const getStudentProfile = async (schoolId, userId) => {
  const ctx = await getStudentContext(schoolId, userId);
  return {
    ...ctx,
    display_name: `${ctx.first_name} ${ctx.last_name}`,
  };
};

export const getStudentTimetable = async (schoolId, userId) => {
  const ctx = await getStudentContext(schoolId, userId);
  if (!ctx.section_id) return { slots: [], section: null };
  const slots = await listTimetableSlots(schoolId, {
    section_id: ctx.section_id,
    academic_year_id: ctx.academic_year_id || undefined,
  });
  return {
    section: { name: ctx.section_name, grade_name: ctx.grade_name, academic_year: ctx.academic_year },
    slots: slots.map((s) => ({
      id: s.id,
      day_of_week: s.day_of_week,
      period_number: s.period_number,
      start_time: s.start_time,
      end_time: s.end_time,
      subject_name: s.subject_name,
      teacher_name: [s.teacher_first_name, s.teacher_last_name].filter(Boolean).join(' '),
    })),
  };
};

export const getStudentAttendance = async (schoolId, userId, { days = 60 } = {}) => {
  const ctx = await getStudentContext(schoolId, userId);
  const safeDays = Math.min(Math.max(Number(days) || 60, 7), 180);

  const [summary, recent] = await Promise.all([
    query(
      `SELECT status, COUNT(*)::int AS count FROM ${ATTENDANCE_TABLE}
       WHERE student_id = $1 AND school_id = $2 AND date >= (CURRENT_DATE - ($3::int * INTERVAL '1 day'))
       GROUP BY status`,
      [ctx.id, schoolId, safeDays]
    ),
    query(
      `SELECT date, status, notes
       FROM ${ATTENDANCE_TABLE}
       WHERE student_id = $1 AND school_id = $2
       ORDER BY date DESC LIMIT 40`,
      [ctx.id, schoolId]
    ),
  ]);

  const rows = summary.rows;
  const total = rows.reduce((s, r) => s + r.count, 0);
  const present = rows.find((r) => r.status === 'present')?.count || 0;

  return {
    days: safeDays,
    summary: { total, present, rate: total ? Math.round((present / total) * 100) : null },
    by_status: rows,
    recent: recent.rows,
  };
};

export const getStudentExams = async (schoolId, userId, filters = {}) => {
  const ctx = await getStudentContext(schoolId, userId);
  return getStudentGradeReport(schoolId, ctx.id, filters);
};

export const getStudentFees = async (schoolId, userId) => {
  const ctx = await getStudentContext(schoolId, userId);
  const inv = await query(
    `SELECT i.id, i.academic_year, i.term, i.amount, i.status, i.due_date,
            COALESCE(i.total_paid, pt.paid, 0)::numeric(12,2) AS total_paid,
            GREATEST(i.amount - COALESCE(i.total_paid, pt.paid, 0), 0)::numeric(12,2) AS balance,
            COALESCE(
              json_agg(json_build_object('name', ii.name, 'amount', ii.amount) ORDER BY ii.name)
              FILTER (WHERE ii.id IS NOT NULL), '[]'::json
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
     ORDER BY i.created_at DESC`,
    [ctx.id, schoolId]
  ).catch(() => ({ rows: [] }));

  const balance = inv.rows.reduce((s, r) => s + Number(r.balance || 0), 0);
  return { invoices: inv.rows, total_balance: balance };
};

export const getStudentAnnouncements = async (schoolId, userId) => {
  await getStudentContext(schoolId, userId);
  const res = await query(
    `SELECT a.id, a.title, a.content, a.priority, a.target_role, a.created_at, a.expires_at,
            u.first_name AS author_first_name, u.last_name AS author_last_name
     FROM operations.announcements a
     LEFT JOIN identity.users u ON u.id = a.author_id
     WHERE a.school_id = $1
       AND (a.target_role IN ('ALL', 'STUDENT') OR a.target_role IS NULL)
       AND (a.expires_at IS NULL OR a.expires_at > now())
     ORDER BY
       CASE a.priority WHEN 'urgent' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
       a.created_at DESC
     LIMIT 40`,
    [schoolId]
  );
  return res.rows;
};

export const getStudentReportCardPdf = async (schoolId, userId, filters = {}) => {
  const ctx = await getStudentContext(schoolId, userId);
  return buildStudentReportCardPdf(schoolId, ctx.id, filters);
};

export const changeStudentPassword = async (schoolId, userId, { current_password, new_password }) => {
  if (!new_password || String(new_password).length < 6) {
    throw new AppError('New password must be at least 6 characters.', 400, ERROR_CODES.VALIDATION_ERROR);
  }
  const user = await query(
    `SELECT u.id, u.password_hash FROM identity.users u
     JOIN student.students s ON s.user_id = u.id AND s.school_id = $2
     WHERE u.id = $1`,
    [userId, schoolId]
  );
  if (!user.rows[0]) throw new AppError('Student account not found.', 404, ERROR_CODES.NOT_FOUND);

  const ok = await comparePasswords(current_password, user.rows[0].password_hash);
  if (!ok) throw new AppError('Current password is incorrect.', 401, ERROR_CODES.INVALID_CREDENTIALS);

  const hashed = await hashPassword(new_password);
  await query(`UPDATE identity.users SET password_hash = $2, updated_at = NOW() WHERE id = $1`, [userId, hashed]);
  return { updated: true };
};
