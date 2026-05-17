import { query } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';

export const listAcademicYears = async (schoolId) => {
  const result = await query(
    `SELECT id, name, start_date, end_date, status
     FROM academic.academicyears
     WHERE school_id = $1
     ORDER BY start_date DESC`,
    [schoolId]
  );
  return result.rows;
};

/** Years with nested terms and enrollment counts (REST replacement for Hasura GraphQL). */
export const listAcademicYearsDetailed = async (schoolId) => {
  const result = await query(
    `SELECT ay.id, ay.name, ay.start_date, ay.end_date, ay.status,
            COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'id', t.id,
                    'name', t.name,
                    'start_date', t.start_date,
                    'end_date', t.end_date
                  ) ORDER BY t.start_date
                )
                FROM academic.terms t
                WHERE t.academic_year_id = ay.id
              ),
              '[]'::json
            ) AS terms,
            (
              SELECT COUNT(*)::int
              FROM student.studentenrollments se
              WHERE se.academic_year_id = ay.id
            ) AS enrollment_count
     FROM academic.academicyears ay
     WHERE ay.school_id = $1
     ORDER BY ay.start_date DESC`,
    [schoolId]
  );
  return result.rows.map((row) => ({
    ...row,
    terms: typeof row.terms === 'string' ? JSON.parse(row.terms) : row.terms || [],
  }));
};

export const createAcademicYear = async (schoolId, { name, start_date, end_date }) => {
  const result = await query(
    `INSERT INTO academic.academicyears (school_id, name, start_date, end_date, status)
     VALUES ($1, $2, $3, $4, 'active')
     RETURNING id, name, start_date, end_date, status`,
    [schoolId, name, start_date, end_date]
  );
  return result.rows[0];
};

export const createTerm = async (schoolId, { academic_year_id, name, start_date, end_date }) => {
  const yearRes = await query(
    `SELECT start_date, end_date FROM academic.academicyears WHERE id = $1 AND school_id = $2`,
    [academic_year_id, schoolId]
  );
  if (!yearRes.rows[0]) {
    throw new AppError('Academic year not found.', 404, ERROR_CODES.NOT_FOUND);
  }
  const year = yearRes.rows[0];
  if (new Date(start_date) < new Date(year.start_date) || new Date(end_date) > new Date(year.end_date)) {
    throw new AppError(
      `Term dates must be within ${year.start_date} and ${year.end_date}`,
      400,
      ERROR_CODES.VALIDATION_ERROR
    );
  }
  const result = await query(
    `INSERT INTO academic.terms (academic_year_id, name, start_date, end_date)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, start_date, end_date, academic_year_id`,
    [academic_year_id, name, start_date, end_date]
  );
  return result.rows[0];
};

export const listTerms = async (schoolId, academicYearId) => {
  const params = [schoolId];
  let sql = `
    SELECT t.id, t.name, t.start_date, t.end_date, t.academic_year_id
    FROM academic.terms t
    JOIN academic.academicyears ay ON ay.id = t.academic_year_id
    WHERE ay.school_id = $1`;
  if (academicYearId) {
    params.push(academicYearId);
    sql += ` AND t.academic_year_id = $2`;
  }
  sql += ' ORDER BY t.start_date';
  const result = await query(sql, params);
  return result.rows;
};

export const listGrades = async (schoolId) => {
  const result = await query(
    `SELECT id, name, level_order
     FROM academic.grades
     WHERE school_id = $1
     ORDER BY level_order NULLS LAST, name`,
    [schoolId]
  );
  return result.rows;
};

export const listSections = async (schoolId, gradeId) => {
  const params = [schoolId];
  let sql = `
    SELECT s.id, s.name, s.grade_id, g.name AS grade_name
    FROM academic.sections s
    JOIN academic.grades g ON g.id = s.grade_id
    WHERE s.school_id = $1`;
  if (gradeId) {
    params.push(gradeId);
    sql += ` AND s.grade_id = $2`;
  }
  sql += ' ORDER BY g.name, s.name';
  const result = await query(sql, params);
  return result.rows;
};

export const listSubjects = async (schoolId) => {
  const result = await query(
    `SELECT id, name
     FROM academic.subjects
     WHERE school_id = $1
     ORDER BY name`,
    [schoolId]
  );
  return result.rows;
};

export const listActiveClasses = async (schoolId, academicYearId) => {
  const params = [schoolId];
  let sql = `
    SELECT c.id, c.name, c.section_id, c.capacity, c.grade_id, c.academic_year_id,
           sec.name AS section_name, g.name AS grade_name
    FROM academic.classes c
    JOIN academic.sections sec ON sec.id = c.section_id
    LEFT JOIN academic.grades g ON g.id = c.grade_id
    WHERE c.school_id = $1`;
  if (academicYearId) {
    params.push(academicYearId);
    sql += ` AND c.academic_year_id = $2`;
  }
  sql += ' ORDER BY g.name, sec.name';
  const result = await query(sql, params);
  return result.rows;
};
