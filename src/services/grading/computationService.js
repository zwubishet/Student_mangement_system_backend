import { query, getClient } from '../../config/db.js';
import { AppError, ERROR_CODES } from '../../utils/errors.js';
import * as engine from './gradeEngine.js';
import * as gradingScale from './gradingScaleService.js';
import {
  loadTermWeightMaps,
  aggregateTermScores,
  fetchLockedTermExamScores,
} from './termWeightResolver.js';

export const enqueueTermComputation = async (schoolId, termId, actorId, existingClient = null) => {
  const runClient = existingClient || await getClient();
  const owns = !existingClient;

  try {
    const res = await runClient.query(
      `INSERT INTO operations.computation_runs (school_id, term_id, run_type, status, created_by)
       VALUES ($1, $2, 'term', 'pending', $3)
       RETURNING id`,
      [schoolId, termId, actorId]
    );
    return res.rows[0];
  } finally {
    if (owns) runClient.release();
  }
};

export const enqueueExamComputation = async (schoolId, examId, actorId, existingClient = null) => {
  const runClient = existingClient || await getClient();
  const owns = !existingClient;

  try {
    const res = await runClient.query(
      `INSERT INTO operations.computation_runs (school_id, exam_id, run_type, status, created_by)
       VALUES ($1, $2, 'exam', 'pending', $3)
       RETURNING id`,
      [schoolId, examId, actorId]
    );
    return res.rows[0];
  } finally {
    if (owns) runClient.release();
  }
};

export const processPendingRuns = async (limit = 5) => {
  const pending = await query(
    `SELECT id, school_id, exam_id, term_id, run_type
     FROM operations.computation_runs
     WHERE status = 'pending'
     ORDER BY created_at
     LIMIT $1`,
    [limit]
  );

  const results = [];
  for (const run of pending.rows) {
    try {
      if (run.run_type === 'exam' && run.exam_id) {
        await runExamComputation(run.school_id, run.exam_id, run.id);
      } else if (run.run_type === 'term' && run.term_id) {
        await runTermComputation(run.school_id, run.term_id, run.id);
      }
      results.push({ id: run.id, status: 'done' });
    } catch (err) {
      await query(
        `UPDATE operations.computation_runs
         SET status = 'failed', error_message = $2, completed_at = NOW()
         WHERE id = $1`,
        [run.id, err.message]
      );
      results.push({ id: run.id, status: 'failed', error: err.message });
    }
  }
  return results;
};

export const runExamComputation = async (schoolId, examId, runId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE operations.computation_runs SET status = 'running', started_at = NOW() WHERE id = $1`,
      [runId]
    );

    await client.query(
      `DELETE FROM operations.computed_results
       WHERE school_id = $1 AND exam_id = $2 AND result_scope = 'exam'`,
      [schoolId, examId]
    );

    const { profile, bands } = await gradingScale.getActiveScaleWithBands(schoolId);

    const rows = await client.query(
      `SELECT er.student_id, er.class_id, er.subject_id, er.score, er.is_absent, er.grade_points,
              t.id AS term_id, t.academic_year_id,
              COALESCE(esch.max_score, es.max_score, e.max_score) AS max_score
       FROM operations.examresults er
       JOIN operations.exams e ON e.id = er.exam_id
       JOIN academic.terms t ON t.id = e.term_id
       LEFT JOIN operations.examsubjects es ON es.id = er.exam_subject_id
       LEFT JOIN operations.exam_schedules esch ON esch.id = er.schedule_id
       WHERE er.exam_id = $1 AND e.school_id = $2 AND er.mark_status = 'locked'
         AND COALESCE(er.is_deleted, false) = false`,
      [examId, schoolId]
    );

    const insertRows = [];
    for (const r of rows.rows) {
      const max = Number(r.max_score) || 100;
      let pct = null;
      let letter = null;
      let gpa = null;
      let passed = false;

      if (r.is_absent) {
        pct = 0;
        letter = 'ABS';
        passed = false;
      } else if (r.score != null) {
        const g = engine.scoreToGrade(r.score, max, bands, { boundaryRule: profile?.boundary_rule });
        pct = g.percentage;
        letter = g.letter;
        gpa = g.gpa;
        passed = g.isPassed;
      }

      insertRows.push([
        schoolId, runId, r.student_id, r.class_id, r.term_id, r.academic_year_id,
        r.subject_id, examId, r.score, max, pct, letter, gpa, passed, r.is_absent ? 1 : 0,
      ]);
    }

    for (const row of insertRows) {
      await client.query(
        `INSERT INTO operations.computed_results (
           school_id, computation_run_id, student_id, class_id, term_id, academic_year_id,
           subject_id, exam_id, result_scope, total_score, max_possible, percentage,
           grade_letter, gpa_points, is_passed, absent_count
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'exam',$9,$10,$11,$12,$13,$14,$15)`,
        row
      );
    }

    const ranked = engine.computeClassRank(
      rows.rows.map((r) => ({
        student_id: r.student_id,
        class_id: r.class_id,
        percentage: r.is_absent ? 0 : engine.toPercentage(r.score, r.max_score),
      })),
      'percentage'
    );

    for (const r of ranked) {
      await client.query(
        `UPDATE operations.computed_results SET rank_in_class = $1
         WHERE computation_run_id = $2 AND student_id = $3 AND exam_id = $4`,
        [r.rank, runId, r.student_id, examId]
      );
    }

    await client.query(
      `UPDATE operations.exam_schedules SET results_ready = true, updated_at = NOW()
       WHERE exam_id = $1 AND school_id = $2`,
      [examId, schoolId]
    );

    await client.query(
      `UPDATE operations.computation_runs
       SET status = 'done', completed_at = NOW(),
           stats = jsonb_build_object('rows', $2::int)
       WHERE id = $1`,
      [runId, insertRows.length]
    );

    await client.query('COMMIT');
    return { processed: insertRows.length, run_id: runId };
  } catch (err) {
    await client.query('ROLLBACK');
    await query(
      `UPDATE operations.computation_runs SET status = 'failed', error_message = $2, completed_at = NOW() WHERE id = $1`,
      [runId, err.message]
    );
    throw err;
  } finally {
    client.release();
  }
};

export const runTermComputation = async (schoolId, termId, runId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE operations.computation_runs SET status = 'running', started_at = NOW() WHERE id = $1`,
      [runId]
    );

    await client.query(
      `DELETE FROM operations.computed_results
       WHERE school_id = $1 AND term_id = $2 AND result_scope IN ('subject_term', 'term_total')`,
      [schoolId, termId]
    );

    const { profile, bands } = await gradingScale.getActiveScaleWithBands(schoolId);
    const weightMaps = await loadTermWeightMaps(schoolId, termId);
    const examRows = await fetchLockedTermExamScores(schoolId, termId);
    const agg = aggregateTermScores(examRows, weightMaps);

    for (const row of agg) {
      const g = engine.scoreToGrade(row.weighted_score, 100, bands, { boundaryRule: profile?.boundary_rule });
      await client.query(
        `INSERT INTO operations.computed_results (
           school_id, computation_run_id, student_id, class_id, term_id, academic_year_id,
           subject_id, result_scope, weighted_score, percentage, grade_letter, gpa_points, is_passed
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'subject_term',$8,$9,$10,$11,$12)`,
        [
          schoolId, runId, row.student_id, row.class_id, termId, row.academic_year_id,
          row.subject_id, row.weighted_score, g.percentage, g.letter, g.gpa, g.isPassed,
        ]
      );
    }

    // Class ranks per subject
    const bySubject = {};
    for (const row of agg) {
      const sid = row.subject_id || 'overall';
      if (!bySubject[sid]) bySubject[sid] = [];
      bySubject[sid].push({
        student_id: row.student_id,
        class_id: row.class_id,
        subject_id: row.subject_id,
        percentage: row.weighted_score,
      });
    }

    for (const rows of Object.values(bySubject)) {
      const ranked = engine.computeClassRank(rows, 'percentage');
      for (const r of ranked) {
        await client.query(
          `UPDATE operations.computed_results SET rank_in_class = $1
           WHERE computation_run_id = $2 AND student_id = $3 AND term_id = $4
             AND subject_id IS NOT DISTINCT FROM $5 AND result_scope = 'subject_term'`,
          [r.rank, runId, r.student_id, termId, r.subject_id]
        );
      }
    }

    await client.query(
      `UPDATE operations.computation_runs
       SET status = 'done', completed_at = NOW(),
           stats = jsonb_build_object('rows', $2::int, 'weights_configured', $3::boolean)
       WHERE id = $1`,
      [runId, agg.length, weightMaps.configured]
    );
    await client.query('COMMIT');
    return { processed: agg.length, weights_configured: weightMaps.configured };
  } catch (err) {
    await client.query('ROLLBACK');
    await query(
      `UPDATE operations.computation_runs SET status = 'failed', error_message = $2, completed_at = NOW() WHERE id = $1`,
      [runId, err.message]
    );
    throw err;
  } finally {
    client.release();
  }
};

export const getRunStatus = async (schoolId, runId) => {
  const result = await query(
    `SELECT * FROM operations.computation_runs WHERE id = $1 AND school_id = $2`,
    [runId, schoolId]
  );
  if (!result.rows[0]) throw new AppError('Computation run not found.', 404, ERROR_CODES.NOT_FOUND);
  return result.rows[0];
};
