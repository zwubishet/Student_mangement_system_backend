import { getClient } from '../../config/db.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';

export const createGradeWithSections = catchAsync(async (req, res, next) => {
  const { name, level_order, sections } = req.body; // sections = ["A", "B", "C"]
  const school_id = req.user.schoolId;

  if (!sections || !Array.isArray(sections) || sections.length === 0) {
    return next(new AppError('Please provide at least one section name.', 400));
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // 1. Insert the Grade
    const gradeRes = await client.query(
      `INSERT INTO academic.grades (school_id, name, level_order) 
       VALUES ($1, $2, $3) RETURNING id, name`,
      [school_id, name, level_order]
    );
    const gradeId = gradeRes.rows[0].id;

    // 2. Insert all Sections for this Grade
    // High-scale: We use map to prepare all insertion promises
    const sectionPromises = sections.map(sectionName => {
      return client.query(
        `INSERT INTO academic.sections (school_id, grade_id, name) 
         VALUES ($1, $2, $3) RETURNING id, name`,
        [school_id, gradeId, sectionName]
      );
    });

    const sectionsRes = await Promise.all(sectionPromises);
    const createdSections = sectionsRes.map(r => r.rows[0]);

    await client.query('COMMIT');

    res.status(201).json({
      status: 'success',
      data: {
        grade: gradeRes.rows[0],
        sections: createdSections
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    // Handle unique constraint violations (e.g., Grade already exists)
    if (err.code === '23505') {
      return next(new AppError('A grade or section with this name already exists in your school.', 400));
    }
    return next(new AppError('Transaction failed: ' + err.message, 500));
  } finally {
    client.release();
  }
});