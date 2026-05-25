import { query } from '../../config/db.js';

/** Marks visible to students/parents after admin publishes the exam. */
export const PORTAL_MARK_STATUSES = ['verified', 'locked'];

const portalMarkFilter = (aliasEr = 'er', aliasE = 'e') => `
  ${aliasE}.school_id = $1
  AND ${aliasE}.is_deleted = false
  AND ${aliasE}.status = 'PUBLISHED'
  AND COALESCE(${aliasEr}.is_deleted, false) = false
  AND ${aliasEr}.mark_status = ANY($3::text[])
  AND ${aliasEr}.student_id = $2
`;

/**
 * Full grade report for a student — used by student and parent portals.
 */
export const getStudentGradeReport = async (schoolId, studentId, { term_id } = {}) => {
  const markParams = [schoolId, studentId, PORTAL_MARK_STATUSES];
  let termClause = '';
  if (term_id) {
    termClause = ' AND e.term_id = $4';
    markParams.push(term_id);
  }

  const [marks, computed, terms, summary] = await Promise.all([
    query(
      `SELECT er.id, e.id AS exam_id, e.name AS exam_name, e.exam_type, e.exam_date,
              e.status AS exam_status, t.name AS term_name, t.id AS term_id,
              sub.name AS subject_name, sub.id AS subject_id,
              er.score, er.is_absent, er.grade AS letter_grade,
              er.mark_status, COALESCE(er.entered_at, er.updated_at)::date AS recorded_at,
              COALESCE(esch.max_score, e.max_score) AS max_score,
              COALESCE(esch.pass_score, e.pass_score) AS pass_score,
              er.is_passed
       FROM operations.examresults er
       JOIN operations.exams e ON e.id = er.exam_id
       LEFT JOIN operations.exam_schedules esch ON esch.id = er.schedule_id
       LEFT JOIN academic.terms t ON t.id = e.term_id
       LEFT JOIN academic.subjects sub ON sub.id = COALESCE(esch.subject_id, er.subject_id)
       WHERE ${portalMarkFilter('er', 'e')}${termClause}
       ORDER BY e.exam_date DESC NULLS LAST, COALESCE(er.entered_at, er.updated_at) DESC`,
      markParams
    ),
    query(
      `SELECT cr.id, cr.subject_id, sub.name AS subject_name,
              cr.grade_letter, cr.percentage, cr.gpa_points,
              cr.rank_in_class, cr.rank_in_grade, cr.is_passed,
              cr.result_scope, cr.weighted_score, cr.total_score, cr.max_possible,
              t.name AS term_name, t.id AS term_id,
              e.name AS exam_name, e.id AS exam_id
       FROM operations.computed_results cr
       LEFT JOIN academic.subjects sub ON sub.id = cr.subject_id
       LEFT JOIN academic.terms t ON t.id = cr.term_id
       LEFT JOIN operations.exams e ON e.id = cr.exam_id
       WHERE cr.school_id = $1 AND cr.student_id = $2
         AND (cr.exam_id IS NULL OR EXISTS (
           SELECT 1 FROM operations.exams ex
           WHERE ex.id = cr.exam_id AND ex.status = 'PUBLISHED' AND ex.is_deleted = false
         ))
       ${term_id ? 'AND cr.term_id = $3' : ''}
       ORDER BY cr.updated_at DESC NULLS LAST, cr.created_at DESC`,
      term_id ? [schoolId, studentId, term_id] : [schoolId, studentId]
    ),
    query(
      `SELECT DISTINCT t.id, t.name, ay.name AS academic_year
       FROM operations.examresults er
       JOIN operations.exams e ON e.id = er.exam_id
       JOIN academic.terms t ON t.id = e.term_id
       LEFT JOIN academic.academicyears ay ON ay.id = t.academic_year_id
       WHERE ${portalMarkFilter('er', 'e')}
       ORDER BY t.name DESC`,
      [schoolId, studentId, PORTAL_MARK_STATUSES]
    ),
    query(
      `SELECT
         COUNT(*)::int AS total_marks,
         COUNT(*) FILTER (WHERE er.is_absent)::int AS absent_count,
         COUNT(*) FILTER (WHERE er.is_passed = true)::int AS passed_count,
         COUNT(*) FILTER (WHERE er.is_passed = false AND NOT er.is_absent)::int AS failed_count,
         ROUND(AVG(
           CASE WHEN NOT er.is_absent AND COALESCE(esch.max_score, e.max_score) > 0
             THEN (er.score::numeric / COALESCE(esch.max_score, e.max_score)) * 100
             ELSE NULL END
         ), 1)::numeric AS average_percent
       FROM operations.examresults er
       JOIN operations.exams e ON e.id = er.exam_id
       JOIN operations.exam_schedules esch ON esch.id = er.schedule_id
       WHERE ${portalMarkFilter('er', 'e')}${termClause}`,
      markParams
    ),
  ]);

  const enrichedMarks = marks.rows.map((r) => ({
    ...r,
    percent: !r.is_absent && r.max_score > 0
      ? Math.round((Number(r.score) / Number(r.max_score)) * 1000) / 10
      : null,
    passed: r.is_passed ?? (r.pass_score != null && !r.is_absent
      ? Number(r.score) >= Number(r.pass_score)
      : null),
  }));

  const byExam = {};
  for (const m of enrichedMarks) {
    const key = m.exam_id;
    if (!byExam[key]) {
      byExam[key] = {
        exam_id: m.exam_id,
        exam_name: m.exam_name,
        exam_type: m.exam_type,
        exam_date: m.exam_date,
        term_name: m.term_name,
        term_id: m.term_id,
        subjects: [],
      };
    }
    byExam[key].subjects.push(m);
  }

  const bySubject = {};
  for (const m of enrichedMarks) {
    const key = m.subject_id || m.subject_name || 'unknown';
    if (!bySubject[key]) {
      bySubject[key] = { subject_id: m.subject_id, subject_name: m.subject_name, marks: [], avg_percent: null };
    }
    bySubject[key].marks.push(m);
  }
  for (const sub of Object.values(bySubject)) {
    const pcts = sub.marks.filter((m) => m.percent != null).map((m) => m.percent);
    sub.avg_percent = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length * 10) / 10 : null;
  }

  return {
    summary: summary.rows[0] || { total_marks: 0, average_percent: null },
    terms: terms.rows,
    exam_marks: enrichedMarks,
    by_exam: Object.values(byExam),
    by_subject: Object.values(bySubject),
    computed_results: computed.rows,
    term_results: computed.rows.filter((r) => r.result_scope === 'subject_term' || r.result_scope === 'term_total'),
    exam_results: computed.rows.filter((r) => r.result_scope === 'exam'),
  };
};

/** Lightweight recent marks for parent child summary card. */
export const getStudentRecentExams = async (schoolId, studentId, limit = 8) => {
  const res = await query(
    `SELECT e.name AS exam_name, sub.name AS subject_name,
            er.score, er.is_absent, er.grade AS letter_grade,
            COALESCE(er.entered_at, er.updated_at)::date AS recorded_at,
            COALESCE(esch.max_score, e.max_score) AS max_score,
            COALESCE(esch.pass_score, e.pass_score) AS pass_score
     FROM operations.examresults er
     JOIN operations.exams e ON e.id = er.exam_id
     LEFT JOIN operations.exam_schedules esch ON esch.id = er.schedule_id
     LEFT JOIN academic.subjects sub ON sub.id = COALESCE(esch.subject_id, er.subject_id)
     WHERE ${portalMarkFilter('er', 'e')}
     ORDER BY COALESCE(er.entered_at, er.updated_at) DESC
     LIMIT $4`,
    [schoolId, studentId, PORTAL_MARK_STATUSES, limit]
  );
  return res.rows.map((r) => ({
    ...r,
    percent: !r.is_absent && r.max_score > 0
      ? Math.round((Number(r.score) / Number(r.max_score)) * 1000) / 10
      : null,
  }));
};
