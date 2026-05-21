import { query, getClient } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { audit, AUDIT_ACTIONS } from '../utils/audit.js';
import { getPaginationParams } from '../utils/pagination.js';
import * as grading from './examGradingService.js';
import * as examTypes from './grading/examTypeService.js';
import * as scheduleConflicts from './grading/scheduleConflictService.js';
import * as gradingScale from './grading/gradingScaleService.js';

const EXAM_STATUSES = ['DRAFT', 'ACTIVE', 'COMPLETED', 'PUBLISHED'];
const EXAM_TYPES = ['midterm', 'final', 'quiz', 'assignment', 'practical', 'continuous_assessment'];
const CLOSED_TERM_STATUSES = ['closed', 'archived'];

const examBaseSelect = `
  e.id, e.school_id, e.name, e.term_id, e.status, e.weightage, e.exam_type,
  e.max_score, e.pass_score, e.exam_date, e.instructions, e.is_deleted,
  e.created_at, e.updated_at, e.created_by
`;

export const getExamOverview = async (schoolId) => {
  const result = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM operations.exams WHERE school_id = $1 AND is_deleted = false) AS exams,
       (SELECT COUNT(*)::int FROM operations.exams WHERE school_id = $1 AND status = 'ACTIVE' AND is_deleted = false) AS active_exams,
       (SELECT COUNT(*)::int FROM operations.exam_schedules WHERE school_id = $1) AS schedules,
       (SELECT COUNT(*)::int FROM operations.examresults er
        JOIN operations.exams e ON e.id = er.exam_id WHERE e.school_id = $1) AS grade_entries,
       (SELECT COUNT(*)::int FROM operations.examresults er
        JOIN operations.exams e ON e.id = er.exam_id
        WHERE e.school_id = $1 AND er.verified_at IS NOT NULL) AS verified_entries`,
    [schoolId]
  );
  return result.rows[0];
};

export const listExams = async (schoolId, queryParams) => {
  const { page, limit, offset } = getPaginationParams(queryParams);
  const { term_id, status, exam_type, include_deleted, class_id } = queryParams;

  const conditions = ['e.school_id = $1'];
  const params = [schoolId];
  let idx = 2;

  if (include_deleted !== 'true') {
    conditions.push('e.is_deleted = false');
  }
  if (term_id) {
    conditions.push(`e.term_id = $${idx++}`);
    params.push(term_id);
  }
  if (status) {
    conditions.push(`e.status = $${idx++}`);
    params.push(status);
  }
  if (exam_type) {
    conditions.push(`e.exam_type = $${idx++}`);
    params.push(exam_type);
  }
  if (class_id) {
    conditions.push(`EXISTS (
      SELECT 1 FROM operations.exam_schedules esch
      WHERE esch.exam_id = e.id AND esch.class_id = $${idx++}
    )`);
    params.push(class_id);
  }

  const where = conditions.join(' AND ');

  const [rows, countResult] = await Promise.all([
    query(
      `SELECT ${examBaseSelect},
              t.name AS term_name, ay.name AS academic_year, ay.id AS academic_year_id,
              COUNT(DISTINCT esch.id)::int AS schedule_count,
              COUNT(DISTINCT esub.id)::int AS subject_count,
              COUNT(DISTINCT er.id)::int AS result_count
       FROM operations.exams e
       JOIN academic.terms t ON t.id = e.term_id
       JOIN academic.academicyears ay ON ay.id = t.academic_year_id
       LEFT JOIN operations.exam_schedules esch ON esch.exam_id = e.id
       LEFT JOIN operations.examsubjects esub ON esub.exam_id = e.id
       LEFT JOIN operations.examresults er ON er.exam_id = e.id
       WHERE ${where}
       GROUP BY e.id, t.name, ay.name, ay.id
       ORDER BY e.exam_date DESC NULLS LAST, e.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*) FROM operations.exams e WHERE ${where}`, params),
  ]);

  return { rows: rows.rows, total: parseInt(countResult.rows[0].count, 10), page, limit };
};

export const getExamById = async (schoolId, examId) => {
  const result = await query(
    `SELECT ${examBaseSelect},
            t.name AS term_name, t.academic_year_id,
            ay.name AS academic_year
     FROM operations.exams e
     JOIN academic.terms t ON t.id = e.term_id
     JOIN academic.academicyears ay ON ay.id = t.academic_year_id
     WHERE e.school_id = $1 AND e.id = $2 AND e.is_deleted = false`,
    [schoolId, examId]
  );
  if (!result.rows[0]) throw new AppError('Exam not found', 404, ERROR_CODES.NOT_FOUND);

  const [schedules, legacySubjects, stats] = await Promise.all([
    listExamSchedules(schoolId, examId),
    query(
      `SELECT es.id, es.subject_id, es.section_id, es.max_score, es.passing_score,
              sub.name AS subject_name, sec.name AS section_name
       FROM operations.examsubjects es
       JOIN academic.subjects sub ON sub.id = es.subject_id
       LEFT JOIN academic.sections sec ON sec.id = es.section_id
       WHERE es.exam_id = $1`,
      [examId]
    ),
    query(
      `SELECT COUNT(DISTINCT er.student_id)::int AS students_graded,
              COUNT(er.id)::int AS entries,
              ROUND(AVG(CASE WHEN er.is_absent THEN NULL ELSE (er.score / NULLIF(COALESCE(esch.max_score, es.max_score, e.max_score), 0)) * 100 END)::numeric, 2) AS avg_percentage
       FROM operations.exams e
       LEFT JOIN operations.examresults er ON er.exam_id = e.id
       LEFT JOIN operations.examsubjects es ON es.id = er.exam_subject_id
       LEFT JOIN operations.exam_schedules esch ON esch.id = er.schedule_id
       WHERE e.id = $1 AND e.school_id = $2`,
      [examId, schoolId]
    ),
  ]);

  return {
    ...result.rows[0],
    schedules,
    legacy_subjects: legacySubjects.rows,
    stats: stats.rows[0] || {},
  };
};

export const createExam = async (data, schoolId, actorId) => {
  const {
    name, term_id, weightage = 0, exam_type = 'midterm',
    max_score = 100, pass_score = 50, exam_date, instructions,
  } = data;

  if (!EXAM_TYPES.includes(exam_type)) {
    throw new AppError('Invalid exam_type.', 400, ERROR_CODES.VALIDATION_ERROR);
  }

  await assertTermInSchool(schoolId, term_id);
  await assertTermOpenForExam(schoolId, term_id);
  await assertTermWeightCapacity(term_id, schoolId, Number(weightage));

  const examTypeId = await examTypes.resolveExamTypeId(schoolId, exam_type);

  const result = await query(
    `INSERT INTO operations.exams (
       school_id, name, term_id, weightage, status, exam_type, exam_type_id,
       max_score, pass_score, exam_date, instructions, created_by
     ) VALUES ($1, $2, $3, $4, 'DRAFT', $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, name, status, exam_type`,
    [schoolId, name, term_id, weightage, exam_type, examTypeId, max_score, pass_score, exam_date || null, instructions || null, actorId]
  );

  audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.CREATE, entity: 'exam', entityId: result.rows[0].id });
  return result.rows[0];
};

export const updateExam = async (schoolId, examId, data, actorId) => {
  const existing = await getExamById(schoolId, examId);
  if (existing.status === 'PUBLISHED' && data.status && data.status !== 'PUBLISHED') {
    throw new AppError('Cannot modify a published exam. Revert status first.', 400, ERROR_CODES.INVALID_OPERATION);
  }

  const allowed = [
    'name', 'weightage', 'exam_type', 'max_score', 'pass_score',
    'exam_date', 'instructions', 'status',
  ];
  const fields = [];
  const params = [];
  let idx = 1;

  for (const key of allowed) {
    if (data[key] !== undefined) {
      if (key === 'status' && !EXAM_STATUSES.includes(data[key])) {
        throw new AppError('Invalid exam status.', 400, ERROR_CODES.VALIDATION_ERROR);
      }
      if (key === 'exam_type' && !EXAM_TYPES.includes(data.exam_type)) {
        throw new AppError('Invalid exam_type.', 400, ERROR_CODES.VALIDATION_ERROR);
      }
      fields.push(`${key} = $${idx++}`);
      params.push(data[key]);
    }
  }

  if (data.weightage !== undefined) {
    await assertTermWeightCapacity(existing.term_id, schoolId, Number(data.weightage), examId);
  }

  if (!fields.length) throw new AppError('No valid fields to update.', 400, ERROR_CODES.VALIDATION_ERROR);

  fields.push(`updated_at = NOW()`);
  params.push(schoolId, examId);

  const result = await query(
    `UPDATE operations.exams SET ${fields.join(', ')}
     WHERE school_id = $${idx++} AND id = $${idx} AND is_deleted = false
     RETURNING id, name, status`,
    params
  );
  if (!result.rows[0]) throw new AppError('Exam not found', 404, ERROR_CODES.NOT_FOUND);

  audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.UPDATE, entity: 'exam', entityId: examId });
  return result.rows[0];
};

export const deleteExam = async (schoolId, examId, actorId) => {
  const exam = await getExamById(schoolId, examId);
  if (exam.status === 'PUBLISHED') {
    throw new AppError('Cannot delete a published exam.', 400, ERROR_CODES.INVALID_OPERATION);
  }
  const results = await query(
    `SELECT COUNT(*)::int AS c FROM operations.examresults WHERE exam_id = $1`,
    [examId]
  );
  if (parseInt(results.rows[0].c, 10) > 0) {
    throw new AppError('Exam has grade entries. Remove results or archive instead.', 400, ERROR_CODES.VALIDATION_ERROR);
  }

  await query(
    `UPDATE operations.exams SET is_deleted = true, status = 'COMPLETED', updated_at = NOW()
     WHERE id = $1 AND school_id = $2`,
    [examId, schoolId]
  );
  audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.DELETE, entity: 'exam', entityId: examId });
  return { deleted: true };
};

// ─── Schedules ───────────────────────────────────────────────────────────────

export const listExamSchedules = async (schoolId, examId) => {
  const result = await query(
    `SELECT esch.id, esch.exam_id, esch.class_id, esch.subject_id,
            esch.max_score, esch.pass_score, esch.room, esch.start_time, esch.end_time,
            esch.invigilator_id,
            c.name AS class_name, c.section_id, sec.name AS section_name,
            g.name AS grade_name, sub.name AS subject_name,
            u.first_name AS invigilator_first_name, u.last_name AS invigilator_last_name,
            (SELECT COUNT(*)::int FROM operations.examresults er WHERE er.schedule_id = esch.id) AS entries_count,
            (SELECT COUNT(*)::int FROM student.studentenrollments se
             WHERE se.school_id = $1 AND se.status = 'active' AND se.section_id = c.section_id
               AND se.academic_year_id = t.academic_year_id) AS enrolled_count,
            exsub.id AS exam_subject_id
     FROM operations.exam_schedules esch
     JOIN operations.exams e ON e.id = esch.exam_id AND e.school_id = $1
     JOIN academic.terms t ON t.id = e.term_id
     JOIN academic.classes c ON c.id = esch.class_id
     JOIN academic.sections sec ON sec.id = c.section_id
     LEFT JOIN academic.grades g ON g.id = c.grade_id
     JOIN academic.subjects sub ON sub.id = esch.subject_id
     LEFT JOIN identity.users u ON u.id = esch.invigilator_id
     LEFT JOIN operations.examsubjects exsub
       ON exsub.exam_id = esch.exam_id AND exsub.subject_id = esch.subject_id AND exsub.section_id = c.section_id
     WHERE esch.exam_id = $2
     ORDER BY g.level_order NULLS LAST, c.name, sub.name`,
    [schoolId, examId]
  );
  return result.rows;
};

export const addExamSchedule = async (schoolId, examId, data, actorId) => {
  const exam = await getExamById(schoolId, examId);
  if (!['DRAFT', 'ACTIVE'].includes(exam.status)) {
    throw new AppError('Cannot add schedules unless exam is DRAFT or ACTIVE.', 400, ERROR_CODES.INVALID_OPERATION);
  }

  const {
    class_id, subject_id, max_score, pass_score, room, start_time, end_time, invigilator_id,
  } = data;

  const conflictCheck = await scheduleConflicts.checkScheduleConflicts(schoolId, {
    class_id, room, start_time, end_time, invigilator_id,
  });
  if (conflictCheck.hasConflict) {
    throw new AppError(conflictCheck.conflicts[0].message, 409, ERROR_CODES.INVALID_OPERATION);
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const meta = await client.query(
      `SELECT c.id, c.section_id, c.school_id
       FROM academic.classes c
       WHERE c.id = $1 AND c.school_id = $2 AND c.is_deleted = false`,
      [class_id, schoolId]
    );
    if (!meta.rows[0]) throw new AppError('Class not found.', 404, ERROR_CODES.NOT_FOUND);

    const subCheck = await client.query(
      `SELECT id FROM academic.subjects WHERE id = $1 AND school_id = $2 AND is_deleted = false`,
      [subject_id, schoolId]
    );
    if (!subCheck.rows[0]) throw new AppError('Subject not found.', 404, ERROR_CODES.NOT_FOUND);

    const resolvedMax = max_score ?? exam.max_score;
    const resolvedPass = pass_score ?? exam.pass_score;

    const sched = await client.query(
      `INSERT INTO operations.exam_schedules (
         school_id, exam_id, class_id, subject_id, max_score, pass_score,
         room, start_time, end_time, invigilator_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [schoolId, examId, class_id, subject_id, resolvedMax, resolvedPass, room || null, start_time || null, end_time || null, invigilator_id || null]
    );

    const exSub = await client.query(
      `INSERT INTO operations.examsubjects (exam_id, subject_id, section_id, max_score, passing_score)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (exam_id, subject_id, section_id)
       DO UPDATE SET max_score = EXCLUDED.max_score, passing_score = EXCLUDED.passing_score
       RETURNING id`,
      [examId, subject_id, meta.rows[0].section_id, resolvedMax, resolvedPass]
    );

    await client.query('COMMIT');
    audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.CREATE, entity: 'exam_schedule', entityId: sched.rows[0].id });
    return { ...sched.rows[0], exam_subject_id: exSub.rows[0]?.id };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      throw new AppError('Schedule already exists for this class and subject.', 409, ERROR_CODES.DUPLICATE_ENTRY);
    }
    throw err;
  } finally {
    client.release();
  }
};

export const updateExamSchedule = async (schoolId, scheduleId, data) => {
  const fields = [];
  const params = [];
  let idx = 1;
  for (const key of ['max_score', 'pass_score', 'room', 'start_time', 'end_time', 'invigilator_id']) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${idx++}`);
      params.push(data[key]);
    }
  }
  if (!fields.length) throw new AppError('No valid fields.', 400, ERROR_CODES.VALIDATION_ERROR);
  fields.push('updated_at = NOW()');
  params.push(schoolId, scheduleId);

  const result = await query(
    `UPDATE operations.exam_schedules SET ${fields.join(', ')}
     WHERE school_id = $${idx++} AND id = $${idx}
     RETURNING *`,
    params
  );
  if (!result.rows[0]) throw new AppError('Schedule not found.', 404, ERROR_CODES.NOT_FOUND);
  return result.rows[0];
};

export const removeExamSchedule = async (schoolId, scheduleId, actorId) => {
  const sched = await query(
    `SELECT esch.*, e.status
     FROM operations.exam_schedules esch
     JOIN operations.exams e ON e.id = esch.exam_id
     WHERE esch.id = $1 AND esch.school_id = $2`,
    [scheduleId, schoolId]
  );
  if (!sched.rows[0]) throw new AppError('Schedule not found.', 404, ERROR_CODES.NOT_FOUND);
  if (sched.rows[0].status === 'PUBLISHED') {
    throw new AppError('Cannot remove schedule from published exam.', 400, ERROR_CODES.INVALID_OPERATION);
  }

  const hasResults = await query(
    `SELECT COUNT(*)::int AS c FROM operations.examresults WHERE schedule_id = $1`,
    [scheduleId]
  );
  if (parseInt(hasResults.rows[0].c, 10) > 0) {
    throw new AppError('Schedule has grade entries. Delete results first.', 400, ERROR_CODES.VALIDATION_ERROR);
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { exam_id, subject_id, class_id } = sched.rows[0];
    const sec = await client.query(`SELECT section_id FROM academic.classes WHERE id = $1`, [class_id]);
    await client.query(`DELETE FROM operations.exam_schedules WHERE id = $1`, [scheduleId]);
    if (sec.rows[0]) {
      await client.query(
        `DELETE FROM operations.examsubjects
         WHERE exam_id = $1 AND subject_id = $2 AND section_id = $3
           AND NOT EXISTS (SELECT 1 FROM operations.examresults er WHERE er.exam_subject_id = operations.examsubjects.id)`,
        [exam_id, subject_id, sec.rows[0].section_id]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.DELETE, entity: 'exam_schedule', entityId: scheduleId });
  return { deleted: true };
};

// ─── Mark entry & grade entries ──────────────────────────────────────────────

export const getMarkEntrySheet = async (schoolId, examId, scheduleId) => {
  const sched = await query(
    `SELECT esch.*, e.term_id, e.max_score AS exam_max, e.status,
            t.academic_year_id, c.section_id, c.name AS class_name, sub.name AS subject_name,
            exsub.id AS exam_subject_id
     FROM operations.exam_schedules esch
     JOIN operations.exams e ON e.id = esch.exam_id AND e.school_id = $1
     JOIN academic.terms t ON t.id = e.term_id
     JOIN academic.classes c ON c.id = esch.class_id
     JOIN academic.subjects sub ON sub.id = esch.subject_id
     LEFT JOIN operations.examsubjects exsub
       ON exsub.exam_id = esch.exam_id AND exsub.subject_id = esch.subject_id AND exsub.section_id = c.section_id
     WHERE esch.id = $2 AND esch.exam_id = $3`,
    [schoolId, scheduleId, examId]
  );
  if (!sched.rows[0]) throw new AppError('Schedule not found.', 404, ERROR_CODES.NOT_FOUND);

  const meta = sched.rows[0];
  const maxScore = meta.max_score ?? meta.exam_max ?? 100;

  const studentSql = `
    SELECT s.id, s.admission_number, s.first_name, s.last_name,
           er.id AS result_id, er.score, er.grade, er.grade_points, er.is_absent, er.is_passed,
           er.teacher_notes, er.verified_at, er.mark_status, er.submitted_at, er.locked_at
    FROM student.studentenrollments se
    JOIN student.students s ON s.id = se.student_id AND s.deleted_at IS NULL AND s.school_id = $1
    LEFT JOIN operations.examresults er
      ON er.student_id = s.id
      AND (er.schedule_id = $4 OR (er.exam_subject_id = $5 AND er.exam_subject_id IS NOT NULL))
    WHERE se.school_id = $1 AND se.status = 'active' AND se.section_id = $2
      AND (se.academic_year_id = $3 OR ($3 IS NULL AND se.academic_year_id IS NULL))
    ORDER BY s.last_name, s.first_name`;

  let students = await query(studentSql, [
    schoolId, meta.section_id, meta.academic_year_id, scheduleId, meta.exam_subject_id,
  ]);

  let enrollment_hint = null;
  if (!students.rows.length) {
    const fallback = await query(
      `SELECT s.id, s.admission_number, s.first_name, s.last_name,
              er.id AS result_id, er.score, er.grade, er.grade_points, er.is_absent, er.is_passed,
              er.teacher_notes, er.verified_at, er.mark_status, er.submitted_at, er.locked_at,
            er.rejection_reason, er.rejected_at
       FROM student.studentenrollments se
       JOIN student.students s ON s.id = se.student_id AND s.deleted_at IS NULL AND s.school_id = $1
       LEFT JOIN operations.examresults er
         ON er.student_id = s.id AND er.schedule_id = $4
       WHERE se.school_id = $1 AND se.status = 'active'
         AND (se.class_id = $2 OR se.section_id = $3)
       ORDER BY s.last_name, s.first_name`,
      [schoolId, meta.class_id, meta.section_id, scheduleId]
    );
    if (fallback.rows.length) {
      students = fallback;
      enrollment_hint =
        'Students are enrolled in this class but not for this exam\'s academic year. '
        + 'Re-enroll them under the same academic year as the exam term, or add a schedule for the year they use.';
    }
  }

  if (!students.rows.length) {
    enrollment_hint =
      enrollment_hint
      || 'No active students in this class. Enroll students in Students → assign section/class for the exam\'s academic year, then return here.';
  }

  return {
    schedule: meta,
    max_score: maxScore,
    pass_score: meta.pass_score,
    students: students.rows,
    enrolled_count: students.rows.length,
    enrollment_hint,
    academic_year_id: meta.academic_year_id,
    section_id: meta.section_id,
    class_name: meta.class_name,
  };
};

export const submitMarks = async (schoolId, examId, scheduleId, payload, actorId) => {
  const { results } = payload;
  if (!results?.length) throw new AppError('No results to save.', 400, ERROR_CODES.VALIDATION_ERROR);

  const sheet = await getMarkEntrySheet(schoolId, examId, scheduleId);
  const { schedule, max_score: maxScore } = sheet;
  if (!['DRAFT', 'ACTIVE', 'COMPLETED'].includes(schedule.status)) {
    throw new AppError('Exam is not open for mark entry.', 400, ERROR_CODES.INVALID_OPERATION);
  }

  const { profile, bands } = await gradingScale.getActiveScaleWithBands(schoolId);
  const client = await getClient();

  try {
    await client.query('BEGIN');

    let examSubjectId = schedule.exam_subject_id;
    if (!examSubjectId) {
      const ins = await client.query(
        `INSERT INTO operations.examsubjects (exam_id, subject_id, section_id, max_score, passing_score)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [examId, schedule.subject_id, schedule.section_id, maxScore, schedule.pass_score]
      );
      examSubjectId = ins.rows[0].id;
    }

    for (const row of results) {
      const studentCheck = await client.query(
        `SELECT id FROM student.students WHERE id = $1 AND school_id = $2`,
        [row.student_id, schoolId]
      );
      if (!studentCheck.rows[0]) {
        throw new AppError(`Student ${row.student_id} not in this school.`, 400, ERROR_CODES.VALIDATION_ERROR);
      }

      const isAbsent = !!row.is_absent;
      let score = row.score;
      let letter = null;
      let points = null;

      if (!isAbsent) {
        if (score == null || score === '') continue;
        score = Number(score);
        if (score > Number(maxScore)) {
          throw new AppError(`Score ${score} exceeds max ${maxScore}.`, 400, ERROR_CODES.VALIDATION_ERROR);
        }
        const g = grading.scoreToGrade(score, maxScore, bands, { boundaryRule: profile?.boundary_rule });
        letter = g.letter;
        points = g.gpa;
      }

      await client.query(
        `INSERT INTO operations.examresults (
           exam_subject_id, student_id, score, grade, grade_points, is_absent, is_passed,
           teacher_notes, entered_by, entered_at, exam_id, subject_id, class_id, schedule_id,
           remarks, mark_status, scale_profile_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, $11, $12, $13, $8, 'draft', $14)
         ON CONFLICT (exam_subject_id, student_id)
         DO UPDATE SET
           score = EXCLUDED.score,
           grade = EXCLUDED.grade,
           grade_points = EXCLUDED.grade_points,
           is_absent = EXCLUDED.is_absent,
           is_passed = EXCLUDED.is_passed,
           teacher_notes = EXCLUDED.teacher_notes,
           remarks = COALESCE(EXCLUDED.teacher_notes, operations.examresults.remarks),
           entered_by = EXCLUDED.entered_by,
           entered_at = NOW(),
           exam_id = EXCLUDED.exam_id,
           subject_id = EXCLUDED.subject_id,
           class_id = EXCLUDED.class_id,
           schedule_id = EXCLUDED.schedule_id,
           scale_profile_id = EXCLUDED.scale_profile_id,
           updated_at = NOW()
         WHERE operations.examresults.mark_status IN ('draft', 'rejected')`,
        [
          examSubjectId, row.student_id, isAbsent ? null : score, letter, points, isAbsent,
          isAbsent ? false : (letter !== 'F' && letter !== 'ABS'),
          row.teacher_notes || null, actorId, examId, schedule.subject_id, schedule.class_id, scheduleId,
          profile?.id || null,
        ]
      );
    }

    await client.query('COMMIT');
    audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.UPDATE, entity: 'exam_marks', entityId: scheduleId });
    return { saved: results.length, schedule_id: scheduleId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const verifyMarks = async (schoolId, examId, scheduleId, actorId) => {
  const result = await query(
    `UPDATE operations.examresults er
     SET verified_by = $1, verified_at = NOW(), updated_at = NOW()
     FROM operations.exam_schedules esch
     WHERE er.schedule_id = esch.id AND esch.id = $2 AND esch.exam_id = $3 AND esch.school_id = $4
       AND er.verified_at IS NULL
     RETURNING er.id`,
    [actorId, scheduleId, examId, schoolId]
  );
  return { verified_count: result.rowCount };
};

export const getExamResults = async (schoolId, examId, queryParams) => {
  const { page, limit, offset } = getPaginationParams(queryParams);
  const { class_id, subject_id, schedule_id } = queryParams;

  const conditions = ['e.school_id = $1', 'e.id = $2'];
  const params = [schoolId, examId];
  let idx = 3;

  if (class_id) { conditions.push(`er.class_id = $${idx++}`); params.push(class_id); }
  if (subject_id) { conditions.push(`er.subject_id = $${idx++}`); params.push(subject_id); }
  if (schedule_id) { conditions.push(`er.schedule_id = $${idx++}`); params.push(schedule_id); }

  const where = conditions.join(' AND ');

  const result = await query(
    `SELECT er.id, er.score, er.grade, er.grade_points, er.is_absent, er.teacher_notes, er.remarks,
            er.verified_at, er.entered_at,
            s.id AS student_id, s.first_name, s.last_name, s.admission_number,
            sub.name AS subject_name, c.name AS class_name,
            COALESCE(esch.max_score, es.max_score, e.max_score) AS max_score
     FROM operations.examresults er
     JOIN operations.exams e ON e.id = er.exam_id
     JOIN student.students s ON s.id = er.student_id
     LEFT JOIN operations.examsubjects es ON es.id = er.exam_subject_id
     LEFT JOIN operations.exam_schedules esch ON esch.id = er.schedule_id
     LEFT JOIN academic.subjects sub ON sub.id = er.subject_id
     LEFT JOIN academic.classes c ON c.id = er.class_id
     WHERE ${where}
     ORDER BY c.name NULLS LAST, sub.name, s.last_name, s.first_name
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) FROM operations.examresults er
     JOIN operations.exams e ON e.id = er.exam_id
     WHERE ${where}`,
    params
  );

  return { rows: result.rows, total: parseInt(countResult.rows[0].count, 10), page, limit };
};

export const calculateTermResults = async (schoolId, termId, actorId) => {
  await assertTermInSchool(schoolId, termId);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const calc = await client.query(
      `WITH per_exam AS (
         SELECT
           er.student_id,
           e.id AS exam_id,
           e.weightage,
           SUM(
             CASE WHEN er.is_absent THEN 0
             ELSE (er.score::float / NULLIF(COALESCE(esch.max_score, es.max_score, e.max_score), 0)::float)
                  * COALESCE(e.weightage, 0)
             END
           ) AS weighted
         FROM operations.examresults er
         JOIN operations.exams e ON e.id = er.exam_id
         LEFT JOIN operations.examsubjects es ON es.id = er.exam_subject_id
         LEFT JOIN operations.exam_schedules esch ON esch.id = er.schedule_id
         WHERE e.term_id = $1 AND e.school_id = $2 AND e.is_deleted = false
           AND e.status IN ('COMPLETED', 'PUBLISHED', 'ACTIVE')
         GROUP BY er.student_id, e.id, e.weightage
       ),
       student_totals AS (
         SELECT student_id, SUM(weighted) AS total_weighted_score
         FROM per_exam
         GROUP BY student_id
       ),
       ranked AS (
         SELECT student_id, total_weighted_score,
                RANK() OVER (ORDER BY total_weighted_score DESC NULLS LAST) AS class_rank
         FROM student_totals
       )
       INSERT INTO academic.term_summaries
         (school_id, student_id, term_id, total_score, average_percentage, letter_grade, class_rank, is_finalized)
       SELECT $2, r.student_id, $1, r.total_weighted_score, r.total_weighted_score,
              CASE
                WHEN r.total_weighted_score IS NULL THEN '—'
                ELSE (
                  SELECT gs.label FROM operations.grading_scales gs
                  WHERE gs.school_id = $2 AND gs.exam_id IS NULL
                    AND r.total_weighted_score >= gs.min_score AND r.total_weighted_score <= gs.max_score
                  ORDER BY gs.sort_order LIMIT 1
                )
              END,
              r.class_rank, true
       FROM ranked r
       ON CONFLICT (student_id, term_id)
       DO UPDATE SET
         total_score = EXCLUDED.total_score,
         average_percentage = EXCLUDED.average_percentage,
         letter_grade = EXCLUDED.letter_grade,
         class_rank = EXCLUDED.class_rank,
         is_finalized = true
       RETURNING student_id`,
      [termId, schoolId]
    );

    await client.query('COMMIT');
    audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.UPDATE, entity: 'term_results', entityId: termId });
    return { processed_students: calc.rowCount, term_id: termId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function assertTermInSchool(schoolId, termId) {
  const termCheck = await query(
    `SELECT t.id FROM academic.terms t
     JOIN academic.academicyears ay ON ay.id = t.academic_year_id
     WHERE t.id = $1 AND ay.school_id = $2`,
    [termId, schoolId]
  );
  if (!termCheck.rows[0]) {
    throw new AppError('Term not found in this school.', 404, ERROR_CODES.NOT_FOUND);
  }
}

async function assertExamHasNoMarks(examId, message) {
  const res = await query(
    `SELECT COUNT(*)::int AS c FROM operations.examresults WHERE exam_id = $1 AND COALESCE(is_deleted, false) = false`,
    [examId]
  );
  if (parseInt(res.rows[0].c, 10) > 0) {
    throw new AppError(message, 400, ERROR_CODES.INVALID_OPERATION);
  }
}

async function assertTermOpenForExam(schoolId, termId) {
  const res = await query(
    `SELECT t.status FROM academic.terms t
     JOIN academic.academicyears ay ON ay.id = t.academic_year_id
     WHERE t.id = $1 AND ay.school_id = $2`,
    [termId, schoolId]
  );
  if (!res.rows[0]) throw new AppError('Term not found.', 404, ERROR_CODES.NOT_FOUND);
  if (CLOSED_TERM_STATUSES.includes(String(res.rows[0].status).toLowerCase())) {
    throw new AppError('Cannot modify exams in a closed term.', 400, ERROR_CODES.INVALID_OPERATION);
  }
}

async function assertTermWeightCapacity(termId, schoolId, addWeight, excludeExamId = null) {
  if (addWeight <= 0) return;
  const params = [termId, schoolId];
  let sql = `SELECT COALESCE(SUM(weightage), 0)::numeric AS total FROM operations.exams
             WHERE term_id = $1 AND school_id = $2 AND is_deleted = false`;
  if (excludeExamId) {
    sql += ' AND id <> $3';
    params.push(excludeExamId);
  }
  const totalWeightRes = await query(sql, params);
  const currentTotal = parseFloat(totalWeightRes.rows[0].total || 0);
  if (currentTotal + Number(addWeight) > 100) {
    throw new AppError(
      `Weightage exceeds 100% for this term (current: ${currentTotal}%).`,
      400,
      ERROR_CODES.INVALID_OPERATION
    );
  }
}
