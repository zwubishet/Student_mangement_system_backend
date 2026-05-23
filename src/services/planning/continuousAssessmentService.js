import { query } from '../../config/db.js';
import { AppError, ERROR_CODES } from '../../utils/errors.js';

export const recordCA = async (schoolId, data, actorId) => {
  const {
    term_id, section_id, subject_id, student_id,
    assessment_type, title, score, max_score = 100, weight_percent, assessed_at, notes,
  } = data;

  const result = await query(
    `INSERT INTO planning.continuous_assessments (
       school_id, term_id, section_id, subject_id, student_id,
       assessment_type, title, score, max_score, weight_percent, assessed_at, recorded_by, notes
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [
      schoolId, term_id, section_id, subject_id, student_id,
      assessment_type, title, score, max_score, weight_percent || null,
      assessed_at || new Date().toISOString().slice(0, 10), actorId, notes,
    ]
  );
  return result.rows[0];
};

export const bulkRecordCA = async (schoolId, { term_id, section_id, subject_id, assessment_type, title, max_score, assessed_at, entries }, actorId) => {
  let count = 0;
  for (const e of entries) {
    await recordCA(schoolId, {
      term_id, section_id, subject_id,
      student_id: e.student_id,
      assessment_type,
      title,
      score: e.score,
      max_score: max_score || 100,
      weight_percent: e.weight_percent,
      assessed_at,
    }, actorId);
    count += 1;
  }
  return { recorded: count };
};

export const getStudentCASummary = async (schoolId, studentId, termId, subjectId) => {
  const rows = await query(
    `SELECT assessment_type, title, score, max_score, weight_percent, assessed_at
     FROM planning.continuous_assessments
     WHERE school_id = $1 AND student_id = $2 AND term_id = $3 AND subject_id = $4
     ORDER BY assessed_at DESC`,
    [schoolId, studentId, termId, subjectId]
  );

  const entries = rows.rows;
  let weightedSum = 0;
  let weightTotal = 0;
  for (const e of entries) {
    const pct = (Number(e.score) / Number(e.max_score)) * 100;
    const w = Number(e.weight_percent) || 1;
    weightedSum += pct * w;
    weightTotal += w;
  }
  const ca_percent = weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 100) / 100 : null;

  return {
    entries,
    ca_average_percent: ca_percent,
    ethiopia_term_weight: { ca: 40, final_exam: 60 },
    projected_term_grade_note: ca_percent != null
      ? `CA component (~40%): ${ca_percent}% — combine with semester final for report card`
      : null,
  };
};

export const getSectionCASheet = async (schoolId, { term_id, section_id, subject_id }) => {
  const [studentsRes, entriesRes] = await Promise.all([
    query(
      `SELECT s.id AS student_id, s.first_name, s.last_name, s.admission_number, s.gender
       FROM student.students s
       JOIN student.studentenrollments se ON se.student_id = s.id AND se.status = 'active'
       WHERE s.school_id = $1 AND se.section_id = $2 AND s.deleted_at IS NULL
       ORDER BY s.last_name, s.first_name`,
      [schoolId, section_id]
    ),
    query(
      `SELECT ca.*
       FROM planning.continuous_assessments ca
       WHERE ca.school_id = $1 AND ca.term_id = $2 AND ca.section_id = $3 AND ca.subject_id = $4
       ORDER BY ca.assessed_at DESC, ca.created_at DESC`,
      [schoolId, term_id, section_id, subject_id]
    ),
  ]);

  const byStudent = {};
  for (const e of entriesRes.rows) {
    if (!byStudent[e.student_id]) byStudent[e.student_id] = [];
    byStudent[e.student_id].push(e);
  }

  const students = studentsRes.rows.map((s) => {
    const assessments = byStudent[s.student_id] || [];
    let sum = 0;
    let count = 0;
    for (const a of assessments) {
      sum += (Number(a.score) / Number(a.max_score)) * 100;
      count += 1;
    }
    const ca_average_percent = count > 0 ? Math.round((sum / count) * 100) / 100 : null;
    return { ...s, assessments, ca_average_percent, assessment_count: count };
  });

  const class_ca_average = students.filter((s) => s.ca_average_percent != null).length
    ? Math.round(
        (students.reduce((a, s) => a + (s.ca_average_percent || 0), 0) /
          students.filter((s) => s.ca_average_percent != null).length) *
          100
      ) / 100
    : null;

  return {
    students,
    entries: entriesRes.rows,
    summary: {
      student_count: students.length,
      class_ca_average,
      total_entries: entriesRes.rows.length,
    },
  };
};

export const deleteCAEntry = async (schoolId, entryId) => {
  const result = await query(
    `DELETE FROM planning.continuous_assessments WHERE id = $1 AND school_id = $2 RETURNING id`,
    [entryId, schoolId]
  );
  if (!result.rows[0]) throw new AppError('Assessment entry not found.', 404, ERROR_CODES.NOT_FOUND);
  return { deleted: true };
};
