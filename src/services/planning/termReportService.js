import { query } from '../../config/db.js';

const DEFAULT_CA_WEIGHT = 40;
const DEFAULT_FINAL_WEIGHT = 60;

const ETHIOPIA_LETTERS = [
  { letter: 'A', label: 'Excellent', min: 90 },
  { letter: 'B', label: 'Very Good', min: 80 },
  { letter: 'C', label: 'Good', min: 70 },
  { letter: 'D', label: 'Satisfactory', min: 60 },
  { letter: 'F', label: 'Fail', min: 0 },
];

export const letterFromPercent = (pct) => {
  if (pct == null || Number.isNaN(pct)) return { letter: '—', label: 'No grade' };
  const n = Number(pct);
  for (const band of ETHIOPIA_LETTERS) {
    if (n >= band.min) return { letter: band.letter, label: band.label };
  }
  return { letter: 'F', label: 'Fail' };
};

/**
 * Ethiopia term grade: CA (40%) + semester final (60%) per student × subject.
 */
export const getSectionTermReportCards = async (
  schoolId,
  { term_id, section_id, subject_id, ca_weight_percent, final_weight_percent }
) => {
  const caW = Number(ca_weight_percent) || DEFAULT_CA_WEIGHT;
  const finalW = Number(final_weight_percent) || DEFAULT_FINAL_WEIGHT;

  const students = await query(
    `SELECT s.id AS student_id, s.admission_number, s.first_name, s.last_name, s.gender
     FROM student.students s
     JOIN student.studentenrollments se ON se.student_id = s.id AND se.status = 'active'
     WHERE se.section_id = $1 AND s.school_id = $2 AND s.deleted_at IS NULL
     ORDER BY s.last_name, s.first_name`,
    [section_id, schoolId]
  );

  const caRows = await query(
    `SELECT student_id,
            SUM((score::float / NULLIF(max_score, 0)::float) * 100) AS sum_pct,
            COUNT(*)::int AS entry_count
     FROM planning.continuous_assessments
     WHERE school_id = $1 AND term_id = $2 AND section_id = $3 AND subject_id = $4
     GROUP BY student_id`,
    [schoolId, term_id, section_id, subject_id]
  );

  const finalRows = await query(
    `SELECT DISTINCT ON (er.student_id)
            er.student_id,
            (er.score::float / NULLIF(COALESCE(esch.max_score, es.max_score, e.max_score), 0)::float) * 100 AS final_percent,
            e.name AS exam_name,
            e.exam_type
     FROM operations.examresults er
     JOIN operations.exams e ON e.id = er.exam_id
     LEFT JOIN operations.examsubjects es ON es.id = er.exam_subject_id
     LEFT JOIN operations.exam_schedules esch ON esch.id = er.schedule_id
     LEFT JOIN operations.exam_types et ON et.id = e.exam_type_id
     JOIN academic.classes c ON c.id = er.class_id
     WHERE e.school_id = $1 AND e.term_id = $2 AND er.subject_id = $3
       AND c.section_id = $4
       AND e.is_deleted = false
       AND COALESCE(er.is_deleted, false) = false
       AND er.is_absent = false
       AND er.score IS NOT NULL
       AND (
         et.code = 'semester_final'
         OR e.exam_type = 'final'
         OR (et.code = 'final')
       )
     ORDER BY er.student_id,
              CASE WHEN et.code = 'semester_final' OR e.exam_type = 'final' THEN 0 ELSE 1 END,
              e.exam_date DESC NULLS LAST`,
    [schoolId, term_id, subject_id, section_id]
  );

  const caMap = Object.fromEntries(
    caRows.rows.map((r) => [
      r.student_id,
      r.entry_count > 0 ? Math.round((r.sum_pct / r.entry_count) * 100) / 100 : null,
    ])
  );
  const finalMap = Object.fromEntries(
    finalRows.rows.map((r) => [r.student_id, Math.round(Number(r.final_percent) * 100) / 100])
  );
  const finalExamName = finalRows.rows[0]?.exam_name || null;

  const cards = students.rows.map((s) => {
    const ca_percent = caMap[s.student_id] ?? null;
    const final_percent = finalMap[s.student_id] ?? null;
    let term_percent = null;
    if (ca_percent != null && final_percent != null) {
      term_percent = Math.round((ca_percent * (caW / 100) + final_percent * (finalW / 100)) * 100) / 100;
    } else if (ca_percent != null && final_percent == null) {
      term_percent = Math.round(ca_percent * (caW / 100) * 100) / 100;
    } else if (final_percent != null && ca_percent == null) {
      term_percent = Math.round(final_percent * (finalW / 100) * 100) / 100;
    }
    const grade = letterFromPercent(term_percent);
    return {
      ...s,
      ca_percent,
      final_percent,
      term_percent,
      letter_grade: grade.letter,
      grade_label: grade.label,
      ca_weight_percent: caW,
      final_weight_percent: finalW,
    };
  });

  return {
    weights: { ca: caW, final_exam: finalW },
    final_exam_name: finalExamName,
    students: cards,
    summary: {
      class_average: cards.filter((c) => c.term_percent != null).length
        ? Math.round(
            (cards.reduce((a, c) => a + (c.term_percent || 0), 0) /
              cards.filter((c) => c.term_percent != null).length) *
              100
          ) / 100
        : null,
      with_ca: cards.filter((c) => c.ca_percent != null).length,
      with_final: cards.filter((c) => c.final_percent != null).length,
    },
  };
};
