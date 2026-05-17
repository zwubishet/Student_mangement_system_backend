import { query, getClient } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { ATTENDANCE_TABLE } from '../utils/attendanceTable.js';

const todayIso = () => new Date().toISOString().split('T')[0];

export const assertTeacherSectionAccess = async (teacherUserId, sectionId) => {
  const check = await query(
    `SELECT 1 FROM academic.teacherassignments WHERE teacher_id = $1 AND section_id = $2 LIMIT 1`,
    [teacherUserId, sectionId]
  );
  if (!check.rows[0]) {
    throw new AppError('You are not assigned to this section.', 403, ERROR_CODES.INVALID_OPERATION);
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

export const getTeacherDashboard = async (schoolId, teacherUserId) => {
  const today = todayIso();

  const [teacher, assignments, attendanceToday] = await Promise.all([
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
         (SELECT COUNT(*)::int FROM student.studentenrollments se
          WHERE se.section_id = sec.id AND se.status = 'active') AS student_count,
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
  ]);

  if (!teacher.rows[0]) {
    throw new AppError('Teacher profile not found.', 404, ERROR_CODES.NOT_FOUND);
  }

  const classes = assignments.rows;
  const totalStudents = classes.reduce((sum, c) => sum + (c.student_count || 0), 0);
  const sectionsDue = classes.filter((c) => c.student_count > 0 && c.marked_today < c.student_count);

  return {
    teacher: teacher.rows[0],
    stats: {
      total_students: totalStudents,
      active_sections: classes.length,
      attendance_marked_today: attendanceToday.rows[0]?.marked || 0,
      sections_pending_attendance: sectionsDue.length,
    },
    classes,
    sections_pending: sectionsDue,
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
       (SELECT COUNT(*)::int FROM student.studentenrollments se
        WHERE se.section_id = sec.id AND se.status = 'active') AS student_count,
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
       JOIN student.students s ON s.id = se.student_id AND s.deleted_at IS NULL
       JOIN identity.users u ON u.id = s.user_id
       LEFT JOIN ${ATTENDANCE_TABLE} a
         ON a.student_id = s.id AND a.section_id = se.section_id AND a.date = $3::date
       WHERE se.section_id = $1::uuid AND sec.school_id = $2::uuid AND se.status = 'active'
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
        `INSERT INTO ${ATTENDANCE_TABLE} (school_id, section_id, student_id, date, status)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (student_id, section_id, date)
         DO UPDATE SET status = EXCLUDED.status`,
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
