import { query, getClient } from '../../config/db.js';
import { AppError, ERROR_CODES } from '../../utils/errors.js';
import { transition } from './gradeStateMachine.js';
import { audit, AUDIT_ACTIONS } from '../../utils/audit.js';
import * as computationService from './computationService.js';

async function logTransition(client, schoolId, resultId, fromStatus, toStatus, actorId, notes) {
  await client.query(
    `INSERT INTO operations.mark_review_log (school_id, exam_result_id, from_status, to_status, actor_id, notes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [schoolId, resultId, fromStatus, toStatus, actorId, notes || null]
  );
}

export const getMarkReviewOverview = async (schoolId, examId) => {
  const result = await query(
    `SELECT esch.id AS schedule_id, c.name AS class_name, sub.name AS subject_name,
            COUNT(er.id)::int AS total_entries,
            COUNT(er.id) FILTER (WHERE er.mark_status = 'submitted')::int AS submitted,
            COUNT(er.id) FILTER (WHERE er.mark_status = 'verified')::int AS verified,
            COUNT(er.id) FILTER (WHERE er.mark_status = 'locked')::int AS locked,
            COUNT(er.id) FILTER (WHERE er.mark_status = 'draft')::int AS drafts
     FROM operations.exam_schedules esch
     JOIN academic.classes c ON c.id = esch.class_id
     JOIN academic.subjects sub ON sub.id = esch.subject_id
     LEFT JOIN operations.examresults er ON er.schedule_id = esch.id AND COALESCE(er.is_deleted, false) = false
     WHERE esch.exam_id = $1 AND esch.school_id = $2
     GROUP BY esch.id, c.name, sub.name
     ORDER BY c.name, sub.name`,
    [examId, schoolId]
  );
  return result.rows;
};

export const submitMarksForSchedule = async (schoolId, examId, scheduleId, actorId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const rows = await client.query(
      `SELECT er.id, er.mark_status FROM operations.examresults er
       JOIN operations.exam_schedules esch ON esch.id = er.schedule_id
       WHERE er.schedule_id = $1 AND esch.exam_id = $2 AND esch.school_id = $3
         AND COALESCE(er.is_deleted, false) = false`,
      [scheduleId, examId, schoolId]
    );

    if (!rows.rows.length) {
      throw new AppError('No marks to submit.', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    let count = 0;
    for (const row of rows.rows) {
      const next = transition(row.mark_status, 'submitted', { role: 'TEACHER' });
      await client.query(
        `UPDATE operations.examresults SET mark_status = $1, submitted_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [next, row.id]
      );
      await logTransition(client, schoolId, row.id, row.mark_status, next, actorId, 'Teacher submitted');
      count += 1;
    }

    await client.query('COMMIT');
    audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.UPDATE, entity: 'exam_marks_submit', entityId: scheduleId });
    return { submitted_count: count };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const verifyScheduleMarks = async (schoolId, examId, scheduleId, actorId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const rows = await client.query(
      `SELECT er.id, er.mark_status FROM operations.examresults er
       JOIN operations.exam_schedules esch ON esch.id = er.schedule_id
       WHERE er.schedule_id = $1 AND esch.exam_id = $2 AND esch.school_id = $3
         AND er.mark_status = 'submitted'`,
      [scheduleId, examId, schoolId]
    );

    for (const row of rows.rows) {
      const next = transition(row.mark_status, 'verified');
      await client.query(
        `UPDATE operations.examresults
         SET mark_status = $1, verified_by = $2, verified_at = NOW(), updated_at = NOW()
         WHERE id = $3`,
        [next, actorId, row.id]
      );
      await logTransition(client, schoolId, row.id, row.mark_status, next, actorId, 'Admin verified');
    }

    await client.query('COMMIT');
    return { verified_count: rows.rows.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const rejectScheduleMarks = async (schoolId, examId, scheduleId, reason, actorId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const rows = await client.query(
      `SELECT er.id, er.mark_status FROM operations.examresults er
       JOIN operations.exam_schedules esch ON esch.id = er.schedule_id
       WHERE er.schedule_id = $1 AND esch.exam_id = $2 AND esch.school_id = $3
         AND er.mark_status IN ('submitted', 'verified')`,
      [scheduleId, examId, schoolId]
    );

    for (const row of rows.rows) {
      const next = transition(row.mark_status, 'rejected');
      await client.query(
        `UPDATE operations.examresults
         SET mark_status = $1, rejected_at = NOW(), rejection_reason = $2,
             verified_by = NULL, verified_at = NULL, updated_at = NOW()
         WHERE id = $3`,
        [next, reason, row.id]
      );
      await logTransition(client, schoolId, row.id, row.mark_status, next, actorId, reason);
    }

    await client.query('COMMIT');
    return { rejected_count: rows.rows.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const lockExamMarks = async (schoolId, examId, actorId) => {
  const pending = await query(
    `SELECT COUNT(*)::int AS c FROM operations.examresults er
     JOIN operations.exams e ON e.id = er.exam_id
     WHERE e.id = $1 AND e.school_id = $2
       AND er.mark_status NOT IN ('verified', 'locked')
       AND COALESCE(er.is_deleted, false) = false`,
    [examId, schoolId]
  );
  if (parseInt(pending.rows[0].c, 10) > 0) {
    throw new AppError(
      'All marks must be verified before locking. Some entries are still draft or submitted.',
      400,
      ERROR_CODES.INVALID_OPERATION
    );
  }

  const client = await getClient();
  let lockedCount = 0;
  let runId = null;
  try {
    await client.query('BEGIN');

    const locked = await client.query(
      `UPDATE operations.examresults er
       SET mark_status = 'locked', locked_at = NOW(), updated_at = NOW()
       FROM operations.exams e
       WHERE er.exam_id = e.id AND e.id = $1 AND e.school_id = $2
         AND er.mark_status = 'verified'
       RETURNING er.id`,
      [examId, schoolId]
    );
    lockedCount = locked.rowCount;

    await client.query(
      `UPDATE operations.exam_schedules SET marks_locked_at = NOW(), locked_by = $1, updated_at = NOW()
       WHERE exam_id = $2 AND school_id = $3`,
      [actorId, examId, schoolId]
    );

    const run = await computationService.enqueueExamComputation(schoolId, examId, actorId, client);
    runId = run.id;

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  let computationResult = { run_id: runId, status: 'pending' };
  try {
    const processed = await computationService.processPendingRuns(3);
    const match = processed.find((p) => p.id === runId);
    if (match) computationResult = match;
  } catch (_) {
    /* background worker can finish */
  }

  audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.UPDATE, entity: 'exam_lock', entityId: examId });
  return { locked_count: lockedCount, computation_run_id: runId, computation: computationResult };
};

export const getMarkEntryProgress = async (schoolId, examId, scheduleId) => {
  const enrolled = await query(
    `SELECT COUNT(*)::int AS c
     FROM student.studentenrollments se
     JOIN operations.exam_schedules esch ON esch.id = $1
     JOIN academic.classes c ON c.id = esch.class_id AND c.section_id = se.section_id
     WHERE se.status = 'active'`,
    [scheduleId]
  );

  const sheet = await query(
    `SELECT
       COUNT(er.id) FILTER (WHERE er.mark_status IN ('draft', 'rejected') AND er.score IS NOT NULL OR er.is_absent)::int AS drafted,
       COUNT(er.id) FILTER (WHERE er.mark_status = 'submitted')::int AS submitted,
       COUNT(er.id) FILTER (WHERE er.mark_status = 'verified')::int AS verified,
       COUNT(er.id) FILTER (WHERE er.mark_status = 'locked')::int AS locked
     FROM operations.examresults er
     WHERE er.schedule_id = $1`,
    [scheduleId]
  );

  const total = parseInt(enrolled.rows[0]?.c || 0, 10);
  const row = sheet.rows[0] || {};
  return {
    total_enrolled: total,
    drafted: Number(row.drafted || 0),
    submitted: Number(row.submitted || 0),
    verified: Number(row.verified || 0),
    locked: Number(row.locked || 0),
  };
};

export const getExamReadiness = async (schoolId, examId) => {
  const result = await query(
    `SELECT
       COUNT(DISTINCT esch.id)::int AS schedules,
       COUNT(er.id) FILTER (WHERE er.mark_status = 'draft')::int AS draft_marks,
       COUNT(er.id) FILTER (WHERE er.mark_status = 'submitted')::int AS submitted_marks,
       COUNT(er.id) FILTER (WHERE er.mark_status = 'verified')::int AS verified_marks,
       COUNT(er.id) FILTER (WHERE er.mark_status = 'locked')::int AS locked_marks
     FROM operations.exam_schedules esch
     LEFT JOIN operations.examresults er ON er.schedule_id = esch.id
     WHERE esch.exam_id = $1 AND esch.school_id = $2`,
    [examId, schoolId]
  );
  const row = result.rows[0] || {};
  return {
    ...row,
    ready_to_lock: Number(row.draft_marks) === 0 && Number(row.submitted_marks) === 0
      && Number(row.verified_marks) > 0,
  };
};
