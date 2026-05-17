import { query } from '../config/db.js';

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
