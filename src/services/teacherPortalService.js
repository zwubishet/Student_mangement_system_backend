import { query, getClient } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { ATTENDANCE_TABLE } from '../utils/attendanceTable.js';
import * as examService from './examService.js';
import * as markReview from './grading/markReviewService.js';
import * as teacherService from './teacherService.js';

const PAYROLL_KEYS = new Set([
  'bank_name', 'bank_account_number', 'bank_branch', 'tax_identification_number',
  'pension_number', 'payment_method',
]);

const todayIso = () => new Date().toISOString().split('T')[0];

/** Enrolled students for section, scoped to class year or current academic year */
const ENROLLED_COUNT_SQL = `(SELECT COUNT(*)::int FROM student.studentenrollments se
  WHERE se.section_id = sec.id AND se.status = 'active'
    AND se.academic_year_id = COALESCE(
      c.academic_year_id,
      (SELECT ay2.id FROM academic.academicyears ay2
       WHERE ay2.school_id = sec.school_id AND ay2.is_current = true AND ay2.is_deleted = false
       LIMIT 1)
    ))`;

export const assertTeacherSectionAccess = async (teacherUserId, sectionId) => {
  const check = await query(
    `SELECT 1 FROM academic.teacherassignments WHERE teacher_id = $1 AND section_id = $2 LIMIT 1`,
    [teacherUserId, sectionId]
  );
  if (!check.rows[0]) {
    throw new AppError('You are not assigned to this section.', 403, ERROR_CODES.INVALID_OPERATION);
  }
};

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
    throw new AppError('You are not assigned to mark this exam schedule.', 403, ERROR_CODES.INVALID_OPERATION);
  }
};

const assignmentBaseSql = `
  FROM academic.teacherassignments ta
  JOIN academic.subjects sub ON sub.id = ta.subject_id
  JOIN academic.sections sec ON sec.id = ta.section_id
  JOIN academic.grades g ON g.id = sec.grade_id
  LEFT JOIN academic.classes c ON c.section_id = sec.id AND c.school_id = sec.school_id
  LEFT JOIN academic.academicyears ay ON ay.id = c.academic_year_id
  WHERE ta.teacher_id = $1 AND sec.school_id = $2
`;

const resolveTeacherRecord = async (schoolId, teacherUserId) => {
  const r = await query(
    `SELECT t.id, t.user_id, t.first_name, t.last_name
     FROM academic.teachers t
     WHERE t.user_id = $1 AND t.school_id = $2 AND t.deleted_at IS NULL`,
    [teacherUserId, schoolId]
  );
  if (!r.rows[0]) throw new AppError('Teacher profile not found.', 404, ERROR_CODES.NOT_FOUND);
  return r.rows[0];
};

export const getTeacherDashboard = async (schoolId, teacherUserId) => {
  const today = todayIso();

  const [teacher, assignments, attendanceToday, marksPending, rejectedMarks, licenceRow, recentActivity] = await Promise.all([
    query(
      `SELECT t.id, t.first_name, t.last_name, t.email, t.department, t.status, t.leave_status
       FROM academic.teachers t WHERE t.user_id = $1 AND t.school_id = $2 AND t.deleted_at IS NULL`,
      [teacherUserId, schoolId]
    ),
    query(
      `SELECT DISTINCT ON (sec.id)
         ta.id AS assignment_id, ta.subject_id, ta.section_id,
         sub.name AS subject_name, sec.name AS section_name,
         g.id AS grade_id, g.name AS grade_name,
         c.id AS class_id, c.name AS class_name, c.capacity,
         ay.name AS academic_year,
         ${ENROLLED_COUNT_SQL} AS student_count,
         (SELECT COUNT(*)::int FROM ${ATTENDANCE_TABLE} a
          WHERE a.section_id = sec.id AND a.date = $3) AS marked_today
       ${assignmentBaseSql}
       ORDER BY sec.id, sub.name`,
      [teacherUserId, schoolId, today]
    ),
    query(
      `SELECT COUNT(DISTINCT a.student_id)::int AS marked
       FROM ${ATTENDANCE_TABLE} a
       JOIN academic.teacherassignments ta ON ta.section_id = a.section_id AND ta.teacher_id = $1
       WHERE a.school_id = $2 AND a.date = $3`,
      [teacherUserId, schoolId, today]
    ),
    query(
      `SELECT COUNT(DISTINCT esch.id)::int AS schedules_needing_action
       FROM operations.exam_schedules esch
       JOIN operations.exams e ON e.id = esch.exam_id
       JOIN academic.classes c ON c.id = esch.class_id
       JOIN academic.teacherassignments ta
         ON ta.section_id = c.section_id AND ta.subject_id = esch.subject_id AND ta.teacher_id = $1
       WHERE e.school_id = $2 AND e.status IN ('ACTIVE', 'COMPLETED')
         AND EXISTS (
           SELECT 1 FROM operations.examresults er
           WHERE er.schedule_id = esch.id AND er.mark_status IN ('draft', 'rejected')
             AND COALESCE(er.is_deleted, false) = false
         )`,
      [teacherUserId, schoolId]
    ),
    query(
      `SELECT COUNT(er.id)::int AS rejected_count
       FROM operations.examresults er
       JOIN operations.exam_schedules esch ON esch.id = er.schedule_id
       JOIN academic.classes c ON c.id = esch.class_id
       JOIN academic.teacherassignments ta
         ON ta.section_id = c.section_id AND ta.subject_id = esch.subject_id AND ta.teacher_id = $1
       WHERE esch.school_id = $2
         AND er.mark_status = 'rejected' AND COALESCE(er.is_deleted, false) = false`,
      [teacherUserId, schoolId]
    ),
    query(
      `SELECT sp.licence_expiry_date, sp.teaching_licence_number
       FROM academic.teachers t
       LEFT JOIN identity.staff_profiles sp ON sp.id = t.staff_profile_id
       WHERE t.user_id = $1 AND t.school_id = $2`,
      [teacherUserId, schoolId]
    ),
    query(
      `SELECT al.action, al.created_at, al.meta
       FROM academic.teacher_activity_logs al
       JOIN academic.teachers t ON t.id = al.teacher_id
       WHERE t.user_id = $1 AND t.school_id = $2
       ORDER BY al.created_at DESC LIMIT 8`,
      [teacherUserId, schoolId]
    ).catch(() => ({ rows: [] })),
  ]);

  if (!teacher.rows[0]) {
    throw new AppError('Teacher profile not found.', 404, ERROR_CODES.NOT_FOUND);
  }

  const classes = assignments.rows;
  const totalStudents = classes.reduce((sum, c) => sum + (c.student_count || 0), 0);
  const sectionsDue = classes.filter((c) => c.student_count > 0 && c.marked_today < c.student_count);

  const licence = licenceRow.rows[0];
  const licenceAlerts = [];
  if (licence?.licence_expiry_date) {
    const expiry = new Date(licence.licence_expiry_date);
    const days = Math.ceil((expiry - new Date()) / (86400000));
    if (days < 0) licenceAlerts.push({ level: 'critical', message: 'Teaching licence expired', days });
    else if (days <= 90) licenceAlerts.push({ level: 'warning', message: `Licence expires in ${days} days`, days });
  }

  const notifications = await getTeacherNotifications(schoolId, teacherUserId).catch(() => []);

  return {
    teacher: teacher.rows[0],
    stats: {
      total_students: totalStudents,
      active_sections: classes.length,
      attendance_marked_today: attendanceToday.rows[0]?.marked || 0,
      sections_pending_attendance: sectionsDue.length,
      marks_pending_submit: marksPending.rows[0]?.schedules_needing_action || 0,
      marks_rejected: rejectedMarks.rows[0]?.rejected_count || 0,
    },
    classes,
    sections_pending: sectionsDue,
    licence_alerts: licenceAlerts,
    notifications: notifications.slice(0, 10),
    activity: recentActivity.rows,
    today,
  };
};

export const getTeacherClasses = async (schoolId, teacherUserId) => {
  const today = todayIso();
  const result = await query(
    `SELECT DISTINCT ON (sec.id, sub.id)
       ta.id AS assignment_id, ta.subject_id, ta.section_id,
       sub.name AS subject_name, sec.name AS section_name,
       g.name AS grade_name, c.id AS class_id, c.name AS class_name, c.capacity,
       ${ENROLLED_COUNT_SQL} AS student_count,
       (SELECT COUNT(*)::int FROM ${ATTENDANCE_TABLE} a
        WHERE a.section_id = sec.id AND a.date = $3) AS marked_today
     ${assignmentBaseSql}
     ORDER BY sec.id, sub.id, g.name, sec.name, sub.name`,
    [teacherUserId, schoolId, today]
  );
  return result.rows.map((row) => ({
    ...row,
    attendance_complete: row.student_count > 0 && row.marked_today >= row.student_count,
  }));
};

export const getTeacherClassDetail = async (schoolId, teacherUserId, sectionId) => {
  await assertTeacherSectionAccess(teacherUserId, sectionId);
  const today = todayIso();

  const [section, students, assignments] = await Promise.all([
    query(
      `SELECT sec.id, sec.name, g.name AS grade_name, c.id AS class_id, c.name AS class_name, c.capacity
       FROM academic.sections sec
       JOIN academic.grades g ON g.id = sec.grade_id
       LEFT JOIN academic.classes c ON c.section_id = sec.id AND c.school_id = sec.school_id
       WHERE sec.id = $1 AND sec.school_id = $2`,
      [sectionId, schoolId]
    ),
    query(
      `SELECT s.id, s.admission_number, s.first_name, s.last_name, s.gender, u.email,
              a.status AS attendance_status
       FROM student.studentenrollments se
       JOIN academic.sections sec ON sec.id = se.section_id
       LEFT JOIN academic.classes c ON c.section_id = sec.id AND c.school_id = sec.school_id
       JOIN student.students s ON s.id = se.student_id AND s.deleted_at IS NULL
       JOIN identity.users u ON u.id = s.user_id
       LEFT JOIN ${ATTENDANCE_TABLE} a
         ON a.student_id = s.id AND a.section_id = se.section_id AND a.date = $3::date
       WHERE se.section_id = $1::uuid AND sec.school_id = $2::uuid AND se.status = 'active'
         AND se.academic_year_id = COALESCE(
           c.academic_year_id,
           (SELECT ay2.id FROM academic.academicyears ay2
            WHERE ay2.school_id = $2 AND ay2.is_current = true AND ay2.is_deleted = false LIMIT 1)
         )
       ORDER BY s.last_name, s.first_name`,
      [sectionId, schoolId, today]
    ),
    query(
      `SELECT ta.id, sub.name AS subject_name
       FROM academic.teacherassignments ta
       JOIN academic.subjects sub ON sub.id = ta.subject_id
       WHERE ta.teacher_id = $1 AND ta.section_id = $2`,
      [teacherUserId, sectionId]
    ),
  ]);

  if (!section.rows[0]) throw new AppError('Section not found.', 404, ERROR_CODES.NOT_FOUND);

  return {
    section: section.rows[0],
    students: students.rows,
    subjects: assignments.rows,
    date: today,
    marked_count: students.rows.filter((s) => s.attendance_status).length,
  };
};

export const getTeacherStudents = async (schoolId, teacherUserId, { search, section_id }) => {
  const params = [teacherUserId, schoolId];
  let idx = 3;
  let extra = '';

  if (section_id) {
    await assertTeacherSectionAccess(teacherUserId, section_id);
    extra += ` AND sec.id = $${idx++}`;
    params.push(section_id);
  }
  if (search) {
    extra += ` AND (s.first_name ILIKE $${idx} OR s.last_name ILIKE $${idx} OR s.admission_number ILIKE $${idx})`;
    params.push(`%${search}%`);
    idx++;
  }

  const result = await query(
    `SELECT DISTINCT ON (s.id)
       s.id, s.admission_number, s.first_name, s.last_name, s.gender, u.email,
       sec.id AS section_id, sec.name AS section_name, g.name AS grade_name,
       sub.name AS subject_name
     FROM academic.teacherassignments ta
     JOIN academic.sections sec ON sec.id = ta.section_id
     JOIN academic.grades g ON g.id = sec.grade_id
     JOIN academic.subjects sub ON sub.id = ta.subject_id
     JOIN student.studentenrollments se ON se.section_id = sec.id AND se.status = 'active'
     JOIN student.students s ON s.id = se.student_id AND s.deleted_at IS NULL
     JOIN identity.users u ON u.id = s.user_id
     WHERE ta.teacher_id = $1 AND sec.school_id = $2 ${extra}
     ORDER BY s.id, g.name, sec.name`,
    params
  );

  return result.rows;
};

export const getTeacherStudentDetail = async (schoolId, teacherUserId, studentId) => {
  const access = await query(
    `SELECT 1 FROM academic.teacherassignments ta
     JOIN student.studentenrollments se ON se.section_id = ta.section_id AND se.status = 'active'
     WHERE ta.teacher_id = $1 AND se.student_id = $2 LIMIT 1`,
    [teacherUserId, studentId]
  );
  if (!access.rows[0]) {
    throw new AppError('Student not in your classes.', 403, ERROR_CODES.INVALID_OPERATION);
  }

  const [student, enrollments, attendanceSummary, examSummary] = await Promise.all([
    query(
      `SELECT s.id, s.admission_number, s.first_name, s.last_name, s.gender, s.date_of_birth,
              s.phone, u.email
       FROM student.students s
       JOIN identity.users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.school_id = $2`,
      [studentId, schoolId]
    ),
    query(
      `SELECT se.*, sec.name AS section_name, g.name AS grade_name
       FROM student.studentenrollments se
       JOIN academic.sections sec ON sec.id = se.section_id
       JOIN academic.grades g ON g.id = sec.grade_id
       WHERE se.student_id = $1`,
      [studentId]
    ),
    query(
      `SELECT status, COUNT(*)::int AS count
       FROM ${ATTENDANCE_TABLE} WHERE student_id = $1 AND school_id = $2
       GROUP BY status`,
      [studentId, schoolId]
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT ROUND(AVG(er.score)::numeric, 1) AS avg_score, COUNT(*)::int AS records
       FROM operations.examresults er
       JOIN operations.exams e ON e.id = er.exam_id
       WHERE er.student_id = $1 AND e.school_id = $2`,
      [studentId, schoolId]
    ).catch(() => ({ rows: [{ avg_score: null, records: 0 }] })),
  ]);

  const att = attendanceSummary.rows;
  const present = att.find((a) => a.status === 'present')?.count || 0;
  const absent = att.find((a) => a.status === 'absent')?.count || 0;
  const total = present + absent + (att.find((a) => a.status === 'late')?.count || 0);

  return {
    ...student.rows[0],
    enrollments: enrollments.rows,
    attendance_rate: total ? Math.round((present / total) * 100) : null,
    exam_summary: examSummary.rows[0],
  };
};

export const markSectionAttendance = async (schoolId, teacherUserId, sectionId, { date, records }) => {
  await assertTeacherSectionAccess(teacherUserId, sectionId);
  if (!records?.length) {
    throw new AppError('No attendance records provided.', 400, ERROR_CODES.VALIDATION_ERROR);
  }

  const attDate = date || todayIso();
  const client = await getClient();
  try {
    await client.query('BEGIN');
    for (const { student_id, status } of records) {
      await client.query(
        `INSERT INTO ${ATTENDANCE_TABLE} (school_id, section_id, student_id, date, status, class_id)
         VALUES ($1, $2, $3, $4, $5, NULL)
         ON CONFLICT (student_id, section_id, date) WHERE (class_id IS NULL)
         DO UPDATE SET status = EXCLUDED.status, marked_at = NOW()`,
        [schoolId, sectionId, student_id, attDate, status]
      );
    }
    await client.query('COMMIT');
    return { marked: records.length, date: attDate, section_id: sectionId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const getSectionAttendance = async (schoolId, teacherUserId, sectionId, date) => {
  await assertTeacherSectionAccess(teacherUserId, sectionId);
  const attDate = date || todayIso();
  const result = await query(
    `SELECT a.student_id, a.status, s.first_name, s.last_name, s.admission_number
     FROM ${ATTENDANCE_TABLE} a
     JOIN student.students s ON s.id = a.student_id
     WHERE a.section_id = $1 AND a.date = $2 AND a.school_id = $3`,
    [sectionId, attDate, schoolId]
  );
  return { date: attDate, records: result.rows };
};

/** Exams / mark entry aligned with operations.exam_schedules (REST, not GraphQL examsubjects) */
export const getTeacherExamMarkTasks = async (schoolId, teacherUserId, { section_id } = {}) => {
  const params = [teacherUserId, schoolId];
  let extra = '';
  if (section_id) {
    await assertTeacherSectionAccess(teacherUserId, section_id);
    extra = ` AND sec.id = $${params.length + 1}`;
    params.push(section_id);
  }

  const result = await query(
    `SELECT e.id AS exam_id, e.name AS exam_name, e.status AS exam_status, e.exam_type,
            e.exam_date, esch.id AS schedule_id, esch.max_score, esch.pass_score,
            c.name AS class_name, sub.name AS subject_name,
            sec.id AS section_id, sec.name AS section_name, g.name AS grade_name,
            t.name AS term_name,
            COUNT(er.id)::int AS entries_count,
            COUNT(er.id) FILTER (WHERE er.mark_status = 'draft')::int AS draft_count,
            COUNT(er.id) FILTER (WHERE er.mark_status = 'submitted')::int AS submitted_count,
            COUNT(er.id) FILTER (WHERE er.mark_status = 'rejected')::int AS rejected_count,
            COUNT(er.id) FILTER (WHERE er.mark_status IN ('verified', 'locked'))::int AS approved_count,
            MAX(er.rejection_reason) FILTER (WHERE er.mark_status = 'rejected') AS last_rejection_reason
     FROM operations.exams e
     JOIN operations.exam_schedules esch ON esch.exam_id = e.id AND esch.school_id = e.school_id
     JOIN academic.classes c ON c.id = esch.class_id
     JOIN academic.sections sec ON sec.id = c.section_id
     JOIN academic.subjects sub ON sub.id = esch.subject_id
     JOIN academic.grades g ON g.id = sec.grade_id
     JOIN academic.terms t ON t.id = e.term_id
     JOIN academic.teacherassignments ta
       ON ta.section_id = sec.id AND ta.subject_id = sub.id AND ta.teacher_id = $1
     LEFT JOIN operations.examresults er ON er.schedule_id = esch.id AND COALESCE(er.is_deleted, false) = false
     WHERE e.school_id = $2 AND COALESCE(e.is_deleted, false) = false
       AND e.status IN ('DRAFT', 'ACTIVE', 'COMPLETED')
       ${extra}
     GROUP BY e.id, e.name, e.status, e.exam_type, e.exam_date, esch.id, esch.max_score, esch.pass_score,
              c.name, sub.name, sec.id, sec.name, g.name, t.name
     ORDER BY e.exam_date DESC NULLS LAST, g.name, sec.name, sub.name`,
    params
  );

  return result.rows.map((row) => ({
    ...row,
    can_edit: ['DRAFT', 'ACTIVE', 'COMPLETED'].includes(row.exam_status),
    mark_workflow:
      Number(row.rejected_count) > 0
        ? 'rejected'
        : row.approved_count > 0 && row.submitted_count === 0 && row.draft_count === 0
          ? 'approved'
          : row.submitted_count > 0
            ? 'submitted'
            : row.draft_count > 0
              ? 'draft'
              : 'not_started',
  }));
};

export const getTeacherNotifications = async (schoolId, teacherUserId) => {
  const items = [];

  const rejected = await query(
    `SELECT er.id, er.rejection_reason, er.rejected_at,
            e.id AS exam_id, e.name AS exam_name, esch.id AS schedule_id,
            sub.name AS subject_name, sec.name AS section_name, g.name AS grade_name
     FROM operations.examresults er
     JOIN operations.exam_schedules esch ON esch.id = er.schedule_id
     JOIN operations.exams e ON e.id = esch.exam_id
     JOIN academic.classes c ON c.id = esch.class_id
     JOIN academic.sections sec ON sec.id = c.section_id
     JOIN academic.grades g ON g.id = sec.grade_id
     JOIN academic.subjects sub ON sub.id = esch.subject_id
     JOIN academic.teacherassignments ta
       ON ta.section_id = sec.id AND ta.subject_id = sub.id AND ta.teacher_id = $1
     WHERE er.mark_status = 'rejected' AND COALESCE(er.is_deleted, false) = false
     ORDER BY er.rejected_at DESC NULLS LAST
     LIMIT 15`,
    [teacherUserId]
  );
  for (const row of rejected.rows) {
    items.push({
      type: 'marks_rejected',
      severity: 'warning',
      title: `Marks rejected — ${row.exam_name}`,
      message: row.rejection_reason || 'Admin requested corrections. Update and resubmit.',
      created_at: row.rejected_at,
      link: { exam_id: row.exam_id, schedule_id: row.schedule_id },
      meta: row,
    });
  }

  const pending = await query(
    `SELECT DISTINCT e.id AS exam_id, e.name AS exam_name, esch.id AS schedule_id,
            sub.name AS subject_name, g.name AS grade_name, sec.name AS section_name
     FROM operations.exam_schedules esch
     JOIN operations.exams e ON e.id = esch.exam_id
     JOIN academic.classes c ON c.id = esch.class_id
     JOIN academic.sections sec ON sec.id = c.section_id
     JOIN academic.grades g ON g.id = sec.grade_id
     JOIN academic.subjects sub ON sub.id = esch.subject_id
     JOIN academic.teacherassignments ta
       ON ta.section_id = sec.id AND ta.subject_id = sub.id AND ta.teacher_id = $1
     WHERE e.school_id = $2 AND e.status IN ('ACTIVE', 'COMPLETED')
       AND EXISTS (
         SELECT 1 FROM operations.examresults er
         WHERE er.schedule_id = esch.id AND er.mark_status IN ('draft', 'rejected')
       )
     LIMIT 10`,
    [teacherUserId, schoolId]
  );
  for (const row of pending.rows) {
    items.push({
      type: 'marks_pending',
      severity: 'info',
      title: `Submit marks — ${row.exam_name}`,
      message: `${row.grade_name} ${row.section_name} · ${row.subject_name}`,
      created_at: new Date().toISOString(),
      link: { exam_id: row.exam_id, schedule_id: row.schedule_id },
      meta: row,
    });
  }

  return items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
};

export const getTeacherMe = async (schoolId, teacherUserId) => {
  const { id: teacherId } = await resolveTeacherRecord(schoolId, teacherUserId);
  const profile = await teacherService.getTeacherProfile(schoolId, teacherId);
  const sanitized = { ...profile };
  for (const key of PAYROLL_KEYS) delete sanitized[key];
  if (sanitized.staff_profile) {
    sanitized.staff_profile = { ...sanitized.staff_profile };
    for (const key of PAYROLL_KEYS) delete sanitized.staff_profile[key];
  }
  return sanitized;
};

export const getTeacherTimetable = async (schoolId, teacherUserId) => {
  const result = await query(
    `SELECT ts.id, ts.day_of_week, ts.period_number, ts.start_time, ts.end_time,
            sub.name AS subject_name, c.id AS class_id, c.name AS class_name,
            sec.id AS section_id, sec.name AS section_name, g.name AS grade_name
     FROM academic.timetable_slots ts
     JOIN academic.subjects sub ON sub.id = ts.subject_id
     JOIN academic.classes c ON c.id = ts.class_id
     JOIN academic.sections sec ON sec.id = c.section_id
     LEFT JOIN academic.grades g ON g.id = sec.grade_id
     WHERE ts.school_id = $1 AND ts.teacher_id = $2
     ORDER BY ts.day_of_week, ts.period_number`,
    [schoolId, teacherUserId]
  );
  return result.rows;
};

export const exportSectionRosterCsv = async (schoolId, teacherUserId, sectionId) => {
  const detail = await getTeacherClassDetail(schoolId, teacherUserId, sectionId);
  const lines = ['admission_number,first_name,last_name,gender,email,attendance_today'];
  for (const s of detail.students) {
    lines.push([
      s.admission_number,
      s.first_name,
      s.last_name,
      s.gender || '',
      s.email || '',
      s.attendance_status || '',
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  }
  const safeName = `${detail.section.grade_name || 'class'}-${detail.section.name || sectionId}`.replace(/\s+/g, '-');
  return {
    filename: `roster-${safeName}-${todayIso()}.csv`,
    content: `${lines.join('\n')}\n`,
  };
};

export const getTeacherClassReportPreview = async (schoolId, teacherUserId, sectionId, { term_id } = {}) => {
  await assertTeacherSectionAccess(teacherUserId, sectionId);

  let termFilter = '';
  const params = [schoolId, sectionId, teacherUserId];
  if (term_id) {
    termFilter = ' AND cr.term_id = $4';
    params.push(term_id);
  }

  const [sectionMeta, results, termRow] = await Promise.all([
    query(
      `SELECT sec.name AS section_name, g.name AS grade_name, ay.name AS academic_year
       FROM academic.sections sec
       JOIN academic.grades g ON g.id = sec.grade_id
       LEFT JOIN academic.classes c ON c.section_id = sec.id AND c.school_id = sec.school_id
       LEFT JOIN academic.academicyears ay ON ay.id = c.academic_year_id
       WHERE sec.id = $1 AND sec.school_id = $2`,
      [sectionId, schoolId]
    ),
    query(
      `SELECT s.id AS student_id, s.admission_number, s.first_name, s.last_name,
              sub.name AS subject_name, e.name AS exam_name,
              cr.grade_letter AS letter_grade,
              cr.percentage AS percentage_score,
              cr.gpa_points AS grade_points,
              cr.rank_in_class,
              cr.result_scope, t.name AS term_name
       FROM operations.computed_results cr
       JOIN student.students s ON s.id = cr.student_id
       LEFT JOIN academic.subjects sub ON sub.id = cr.subject_id
       LEFT JOIN operations.exams e ON e.id = cr.exam_id
       LEFT JOIN academic.terms t ON t.id = cr.term_id
       WHERE cr.school_id = $1
         AND cr.student_id IN (
           SELECT se.student_id FROM student.studentenrollments se
           WHERE se.section_id = $2 AND se.status = 'active'
         )
         AND EXISTS (
           SELECT 1 FROM academic.teacherassignments ta
           WHERE ta.teacher_id = $3 AND ta.section_id = $2
             AND (cr.subject_id IS NULL OR ta.subject_id = cr.subject_id)
         )
         ${termFilter}
       ORDER BY s.last_name, s.first_name, sub.name`,
      params
    ),
    term_id
      ? query(`SELECT id, name FROM academic.terms WHERE id = $1 AND school_id = $2`, [term_id, schoolId])
      : query(
          `SELECT t.id, t.name FROM academic.terms t
           WHERE t.school_id = $1 AND t.is_current = true AND t.is_deleted = false
           LIMIT 1`,
          [schoolId]
        ),
  ]);

  return {
    section: sectionMeta.rows[0],
    term: termRow.rows[0] || null,
    results: results.rows,
    summary: {
      students_with_results: new Set(results.rows.map((r) => r.student_id)).size,
      result_rows: results.rows.length,
    },
  };
};

export const getSectionGuardianDirectory = async (schoolId, teacherUserId, sectionId) => {
  await assertTeacherSectionAccess(teacherUserId, sectionId);

  const result = await query(
    `SELECT s.id AS student_id, s.admission_number, s.first_name, s.last_name,
            g.id AS guardian_id, g.relationship, gl.is_primary, gl.is_emergency,
            COALESCE(gu.email, g.email) AS guardian_email,
            COALESCE(gu.first_name, g.first_name) AS guardian_first_name,
            COALESCE(gu.last_name, g.last_name) AS guardian_last_name,
            g.phone_primary AS guardian_phone
     FROM student.studentenrollments se
     JOIN student.students s ON s.id = se.student_id AND s.deleted_at IS NULL
     LEFT JOIN student.guardian_links gl ON gl.student_id = s.id
     LEFT JOIN student.guardians g ON g.id = gl.guardian_id
     LEFT JOIN identity.users gu ON gu.id = g.user_id
     WHERE se.section_id = $1 AND se.status = 'active' AND s.school_id = $2
     ORDER BY s.last_name, s.first_name, gl.is_primary DESC`,
    [sectionId, schoolId]
  );

  return {
    section_id: sectionId,
    contacts: result.rows,
    note: 'Direct messaging is not enabled. Contact guardians through the school office.',
  };
};

export const getTeacherMarkSheet = async (schoolId, teacherUserId, examId, scheduleId) => {
  await assertTeacherScheduleAccess(schoolId, teacherUserId, examId, scheduleId);
  return examService.getMarkEntrySheet(schoolId, examId, scheduleId);
};

export const saveTeacherMarks = async (schoolId, teacherUserId, examId, scheduleId, payload) => {
  await assertTeacherScheduleAccess(schoolId, teacherUserId, examId, scheduleId);
  return examService.submitMarks(schoolId, examId, scheduleId, payload, teacherUserId);
};

export const submitTeacherMarksForReview = async (schoolId, teacherUserId, examId, scheduleId) => {
  await assertTeacherScheduleAccess(schoolId, teacherUserId, examId, scheduleId);
  return markReview.submitMarksForSchedule(schoolId, examId, scheduleId, teacherUserId);
};
