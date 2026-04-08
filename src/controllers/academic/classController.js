import { getClient } from '../../config/db.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';

export const createClassesBulk = catchAsync(async (req, res, next) => {
  const { input, session_variables } = req.body;
  const { academic_year_id, grade_name, sections } = input.object; // Taking names instead of IDs
  
  const school_id = session_variables['x-hasura-school-id'];
  if (!school_id) return next(new AppError('Unauthorized: School context missing.', 401));

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. Verify Academic Year
    const yearCheck = await client.query(
      'SELECT id FROM academic.academicyears WHERE id = $1 AND school_id = $2',
      [academic_year_id, school_id]
    );
    if (yearCheck.rows.length === 0) throw new Error('Academic Year not found.');

    // 2. Ensure Grade exists (Upsert Grade)
    const gradeRes = await client.query(
      `INSERT INTO academic.grades (school_id, name)
       VALUES ($1, $2)
       ON CONFLICT (school_id, name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name`,
      [school_id, grade_name]
    );
    const grade_id = gradeRes.rows[0].id;

    // 3. Process Sections and Classes
    const classResults = await Promise.all(
      sections.map(async (item) => {
        // A. Ensure Section exists (Upsert Section)
        const sectionRes = await client.query(
          `INSERT INTO academic.sections (school_id, grade_id, name)
           VALUES ($1, $2, $3)
           ON CONFLICT (grade_id, name) DO UPDATE SET name = EXCLUDED.name
           RETURNING id, name`,
          [school_id, grade_id, item.section_name]
        );
        const section_id = sectionRes.rows[0].id;
        const section_name = sectionRes.rows[0].name;

        // B. Construct the full Class Name
        const fullClassName = `${grade_name} - ${section_name}`;

        // C. Initialize/Update the Class
        const classRes = await client.query(
          `INSERT INTO academic.classes (school_id, section_id, grade_id, academic_year_id, name, capacity)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (section_id, academic_year_id) 
           DO UPDATE SET 
            capacity = EXCLUDED.capacity,
            name = EXCLUDED.name
           RETURNING id, name, capacity`,
          [school_id, section_id, grade_id, academic_year_id, fullClassName, item.capacity || 30]
        );

        return classRes.rows[0];
      })
    );

    await client.query('COMMIT');

    res.json({
      results: classResults.length,
      classes: classResults
    });

  } catch (err) {
    await client.query('ROLLBACK');
    return next(new AppError(err.message, 421));
  } finally {
    client.release();
  }
});