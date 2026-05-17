import { query } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { audit, AUDIT_ACTIONS } from '../utils/audit.js';
import { getPaginationParams } from '../utils/pagination.js';

export const listExams = async (schoolId, queryParams) => {
  const { page, limit, offset } = getPaginationParams(queryParams);
  const { term_id, status } = queryParams;

  const conditions = ['e.school_id = $1'];
  const params = [schoolId];
  let idx = 2;

  if (term_id) {
    conditions.push(`e.term_id = $${idx++}`);
    params.push(term_id);
  }
  if (status) {
    conditions.push(`e.status = $${idx++}`);
    params.push(status);
  }

  const where = conditions.join(' AND ');

  const [rows, countResult] = await Promise.all([
    query(
      `SELECT 
         e.id, e.name, e.term_id, e.status, e.weightage, e.created_at,
         t.name AS term_name,
         ay.name AS academic_year,
         COUNT(DISTINCT es.id)::int AS subject_count
       FROM operations.exams e
       JOIN academic.terms t ON t.id = e.term_id
       JOIN academic.academicyears ay ON ay.id = t.academic_year_id
       LEFT JOIN operations.examsubjects es ON es.exam_id = e.id
       WHERE ${where}
       GROUP BY e.id, e.name, e.term_id, e.status, e.weightage, e.created_at, t.name, ay.name
       ORDER BY e.created_at DESC NULLS LAST, e.name
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*) FROM operations.exams e WHERE ${where}`, params),
  ]);

  return { rows: rows.rows, total: parseInt(countResult.rows[0].count, 10), page, limit };
};

export const getExamById = async (schoolId, examId) => {
  const result = await query(
    `SELECT 
       e.id, e.name, e.term_id, e.status, e.weightage, e.created_at,
       t.name AS term_name,
       ay.name AS academic_year,
       COALESCE(
         json_agg(
           json_build_object(
             'id', es.id,
             'subject_id', es.subject_id,
             'subject_name', sub.name,
             'max_score', es.max_score,
             'section_id', es.section_id,
             'passing_score', es.passing_score
           )
         ) FILTER (WHERE es.id IS NOT NULL),
         '[]'
       ) AS subjects
     FROM operations.exams e
     JOIN academic.terms t ON t.id = e.term_id
     JOIN academic.academicyears ay ON ay.id = t.academic_year_id
     LEFT JOIN operations.examsubjects es ON es.exam_id = e.id
     LEFT JOIN academic.subjects sub ON sub.id = es.subject_id AND sub.school_id = e.school_id
     WHERE e.school_id = $1 AND e.id = $2
     GROUP BY e.id, e.name, e.term_id, e.status, e.weightage, e.created_at, t.name, ay.name`,
    [schoolId, examId]
  );

  if (!result.rows[0]) throw new AppError('Exam not found', 404, ERROR_CODES.NOT_FOUND);
  return result.rows[0];
};

export const createExam = async (data, schoolId, actorId) => {
  const { name, term_id, weightage = 0 } = data;

  const termCheck = await query(
    `SELECT t.id 
     FROM academic.terms t
     JOIN academic.academicyears ay ON ay.id = t.academic_year_id
     WHERE t.id = $1 AND ay.school_id = $2`,
    [term_id, schoolId]
  );
  if (!termCheck.rows[0]) {
    throw new AppError('Term not found in this school.', 404, ERROR_CODES.NOT_FOUND);
  }

  if (weightage > 0) {
    const totalWeightRes = await query(
      `SELECT COALESCE(SUM(weightage), 0)::numeric AS total 
       FROM operations.exams 
       WHERE term_id = $1 AND school_id = $2`,
      [term_id, schoolId]
    );
    const currentTotal = parseFloat(totalWeightRes.rows[0].total || 0);
    if (currentTotal + Number(weightage) > 100) {
      throw new AppError(
        `Weightage exceeds 100% for this term (current: ${currentTotal}%).`,
        400,
        ERROR_CODES.INVALID_OPERATION
      );
    }
  }

  const result = await query(
    `INSERT INTO operations.exams (school_id, name, term_id, weightage, status)
     VALUES ($1, $2, $3, $4, 'DRAFT') RETURNING id, name, status`,
    [schoolId, name, term_id, weightage]
  );

  audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.CREATE, entity: 'exam', entityId: result.rows[0].id });
  return result.rows[0];
};

export const getExamResults = async (schoolId, examId, queryParams) => {
  const { page, limit, offset } = getPaginationParams(queryParams);

  const examCheck = await query(
    `SELECT id FROM operations.exams WHERE id = $1 AND school_id = $2`,
    [examId, schoolId]
  );
  if (!examCheck.rows[0]) throw new AppError('Exam not found', 404, ERROR_CODES.NOT_FOUND);

  const result = await query(
    `SELECT 
       er.id, er.score, er.grade, er.remarks,
       s.id AS student_id, s.first_name, s.last_name, s.admission_number,
       sub.name AS subject_name, es.max_score, es.id AS exam_subject_id
     FROM operations.examresults er
     JOIN student.students s ON s.id = er.student_id AND s.school_id = $1
     JOIN operations.examsubjects es ON es.id = er.exam_subject_id
     JOIN operations.exams e ON e.id = es.exam_id AND e.school_id = $1
     JOIN academic.subjects sub ON sub.id = es.subject_id
     WHERE e.id = $2
     ORDER BY s.last_name, s.first_name, sub.name
     LIMIT $3 OFFSET $4`,
    [schoolId, examId, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) 
     FROM operations.examresults er
     JOIN operations.examsubjects es ON es.id = er.exam_subject_id
     JOIN operations.exams e ON e.id = es.exam_id
     WHERE e.school_id = $1 AND e.id = $2`,
    [schoolId, examId]
  );

  return { rows: result.rows, total: parseInt(countResult.rows[0].count, 10), page, limit };
};
