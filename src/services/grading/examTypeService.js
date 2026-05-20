import { query, getClient } from '../../config/db.js';
import { AppError, ERROR_CODES } from '../../utils/errors.js';
import * as engine from './gradeEngine.js';

export const listExamTypes = async (schoolId) => {
  const result = await query(
    `SELECT id, code, name, description, default_weight_percent, counts_toward_term, sort_order
     FROM operations.exam_types
     WHERE school_id = $1 AND is_deleted = false
     ORDER BY sort_order, name`,
    [schoolId]
  );
  return result.rows;
};

export const getTermWeights = async (schoolId, termId, subjectId = null) => {
  const result = await query(
    `SELECT taw.id, taw.term_id, taw.subject_id, taw.exam_type_id, taw.weight_percent,
            et.code, et.name AS exam_type_name
     FROM operations.term_assessment_weights taw
     JOIN operations.exam_types et ON et.id = taw.exam_type_id
     WHERE taw.school_id = $1 AND taw.term_id = $2
       AND (($3::uuid IS NULL AND taw.subject_id IS NULL) OR taw.subject_id = $3)
     ORDER BY et.sort_order`,
    [schoolId, termId, subjectId]
  );
  return result.rows;
};

export const assertTermWeightsSum100 = async (schoolId, termId, subjectId = null) => {
  const rows = await getTermWeights(schoolId, termId, subjectId);
  if (!rows.length) return { valid: true, sum: 0, rows: [] };
  const sum = rows.reduce((a, r) => a + Number(r.weight_percent), 0);
  if (!engine.weightsSumTo100(rows)) {
    throw new AppError(
      `Assessment weights for this term must sum to 100% (current: ${Math.round(sum * 100) / 100}%).`,
      400,
      ERROR_CODES.INVALID_OPERATION
    );
  }
  return { valid: true, sum, rows };
};

export const upsertTermWeights = async (schoolId, termId, subjectId, weights, actorId) => {
  if (!weights?.length) {
    throw new AppError('At least one weight row is required.', 400, ERROR_CODES.VALIDATION_ERROR);
  }

  const sum = weights.reduce((a, w) => a + Number(w.weight_percent), 0);
  if (Math.abs(sum - 100) > 0.01) {
    throw new AppError(`Weights must sum to 100% (got ${sum}).`, 400, ERROR_CODES.VALIDATION_ERROR);
  }

  const termCheck = await query(
    `SELECT t.id FROM academic.terms t
     JOIN academic.academicyears ay ON ay.id = t.academic_year_id
     WHERE t.id = $1 AND ay.school_id = $2`,
    [termId, schoolId]
  );
  if (!termCheck.rows[0]) throw new AppError('Term not found.', 404, ERROR_CODES.NOT_FOUND);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    await client.query(
      `DELETE FROM operations.term_assessment_weights
       WHERE school_id = $1 AND term_id = $2
         AND (($3::uuid IS NULL AND subject_id IS NULL) OR subject_id = $3)`,
      [schoolId, termId, subjectId]
    );

    for (const w of weights) {
      await client.query(
        `INSERT INTO operations.term_assessment_weights (school_id, term_id, subject_id, exam_type_id, weight_percent)
         VALUES ($1, $2, $3, $4, $5)`,
        [schoolId, termId, subjectId || null, w.exam_type_id, w.weight_percent]
      );
    }

    await client.query('COMMIT');
    return getTermWeights(schoolId, termId, subjectId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const resolveExamTypeId = async (schoolId, examTypeCode) => {
  const result = await query(
    `SELECT id FROM operations.exam_types
     WHERE school_id = $1 AND code = $2 AND is_deleted = false`,
    [schoolId, examTypeCode]
  );
  return result.rows[0]?.id || null;
};
