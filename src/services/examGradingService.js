import { query } from '../config/db.js';
import * as engine from './grading/gradeEngine.js';

const DEFAULT_SCALE = [
  { label: 'A+', min_score: 90, max_score: 100, grade_points: 4.0 },
  { label: 'A', min_score: 85, max_score: 89.99, grade_points: 3.7 },
  { label: 'B+', min_score: 80, max_score: 84.99, grade_points: 3.3 },
  { label: 'B', min_score: 75, max_score: 79.99, grade_points: 3.0 },
  { label: 'C+', min_score: 70, max_score: 74.99, grade_points: 2.7 },
  { label: 'C', min_score: 50, max_score: 69.99, grade_points: 2.0 },
  { label: 'F', min_score: 0, max_score: 49.99, grade_points: 0 },
];

export const loadGradingScale = async (schoolId, examId = null) => {
  const result = await query(
    `SELECT label, min_score, max_score, grade_points, description, sort_order
     FROM operations.grading_scales
     WHERE school_id = $1 AND (exam_id IS NULL OR exam_id = $2)
     ORDER BY sort_order, min_score DESC`,
    [schoolId, examId]
  );
  if (result.rows.length) return result.rows;
  return DEFAULT_SCALE;
};

/** @returns {{ letter: string, gpa: number|null, grade_points: number|null, percentage: number, isPassed: boolean }} */
export const scoreToGrade = (score, maxScore, scaleRows, opts = {}) => {
  const scale = scaleRows?.length ? scaleRows : DEFAULT_SCALE;
  const g = engine.scoreToGrade(score, maxScore, scale, opts);
  return {
    letter: g.letter,
    grade_points: g.gpa,
    gpa: g.gpa,
    percentage: g.percentage,
    isPassed: g.isPassed,
  };
};

export const listGradingScales = async (schoolId, examId = null) => {
  return loadGradingScale(schoolId, examId);
};

export const upsertGradingScale = async (schoolId, data) => {
  const { id, exam_id, label, min_score, max_score, grade_points, description, sort_order } = data;
  if (id) {
    const res = await query(
      `UPDATE operations.grading_scales
       SET label = COALESCE($3, label), min_score = COALESCE($4, min_score),
           max_score = COALESCE($5, max_score), grade_points = COALESCE($6, grade_points),
           description = COALESCE($7, description), sort_order = COALESCE($8, sort_order)
       WHERE id = $1 AND school_id = $2
       RETURNING *`,
      [id, schoolId, label, min_score, max_score, grade_points, description, sort_order]
    );
    return res.rows[0];
  }
  const res = await query(
    `INSERT INTO operations.grading_scales
       (school_id, exam_id, label, min_score, max_score, grade_points, description, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [schoolId, exam_id || null, label, min_score, max_score, grade_points ?? null, description || null, sort_order ?? 0]
  );
  return res.rows[0];
};

export const deleteGradingScale = async (schoolId, scaleId) => {
  await query(`DELETE FROM operations.grading_scales WHERE id = $1 AND school_id = $2`, [scaleId, schoolId]);
  return { deleted: true };
};
