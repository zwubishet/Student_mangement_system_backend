import { query } from '../../config/db.js';

/**
 * Load term assessment weights keyed by subject + exam type code.
 * Subject-specific rows override school-wide (subject_id IS NULL).
 */
export const loadTermWeightMaps = async (schoolId, termId) => {
  const rows = await query(
    `SELECT taw.subject_id, et.code AS exam_type_code, taw.weight_percent
     FROM operations.term_assessment_weights taw
     JOIN operations.exam_types et ON et.id = taw.exam_type_id
     WHERE taw.school_id = $1 AND taw.term_id = $2`,
    [schoolId, termId]
  );

  const global = {};
  const bySubject = {};
  for (const r of rows.rows) {
    const pct = Number(r.weight_percent);
    if (r.subject_id) {
      if (!bySubject[r.subject_id]) bySubject[r.subject_id] = {};
      bySubject[r.subject_id][r.exam_type_code] = pct;
    } else {
      global[r.exam_type_code] = pct;
    }
  }
  return { global, bySubject, configured: rows.rows.length > 0 };
};

export const resolveWeightPercent = (maps, subjectId, examTypeCode, examWeightageFallback = 0) => {
  const subjectMap = subjectId ? maps.bySubject[subjectId] : null;
  if (subjectMap?.[examTypeCode] != null) return Number(subjectMap[examTypeCode]);
  if (maps.global[examTypeCode] != null) return Number(maps.global[examTypeCode]);
  if (examWeightageFallback > 0) return Number(examWeightageFallback);
  return 0;
};

/** Aggregate weighted term scores per student/subject using term_assessment_weights. */
export const aggregateTermScores = (examRows, weightMaps) => {
  const buckets = new Map();

  for (const row of examRows) {
    const weight = resolveWeightPercent(
      weightMaps,
      row.subject_id,
      row.exam_type,
      row.exam_weightage
    );
    if (weight <= 0 || row.pct == null) continue;

    const key = `${row.student_id}:${row.subject_id}:${row.class_id}:${row.academic_year_id}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        student_id: row.student_id,
        subject_id: row.subject_id,
        class_id: row.class_id,
        academic_year_id: row.academic_year_id,
        weighted_sum: 0,
        weight_total: 0,
      });
    }
    const b = buckets.get(key);
    b.weighted_sum += Number(row.pct) * (weight / 100);
    b.weight_total += weight;
  }

  return [...buckets.values()].map((b) => ({
    student_id: b.student_id,
    subject_id: b.subject_id,
    class_id: b.class_id,
    academic_year_id: b.academic_year_id,
    weighted_score: b.weight_total > 0
      ? Math.round((b.weighted_sum / b.weight_total) * 10000) / 100
      : 0,
    weight_total: b.weight_total,
  }));
};

export const fetchLockedTermExamScores = async (schoolId, termId) => {
  const result = await query(
    `SELECT er.student_id, er.subject_id, er.class_id, t.academic_year_id,
            e.exam_type, e.weightage AS exam_weightage,
            CASE WHEN er.is_absent THEN 0
                 ELSE (er.score::float / NULLIF(COALESCE(esch.max_score, es.max_score, e.max_score), 0)::float) * 100
            END AS pct
     FROM operations.examresults er
     JOIN operations.exams e ON e.id = er.exam_id
     JOIN academic.terms t ON t.id = e.term_id
     LEFT JOIN operations.examsubjects es ON es.id = er.exam_subject_id
     LEFT JOIN operations.exam_schedules esch ON esch.id = er.schedule_id
     WHERE e.term_id = $1 AND e.school_id = $2 AND e.is_deleted = false
       AND er.mark_status = 'locked'
       AND COALESCE(er.is_deleted, false) = false`,
    [termId, schoolId]
  );
  return result.rows;
};
