import { getClient } from '../../config/db.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';

export const createGradeWithSections = catchAsync(async (req, res, next) => {
 const { input, session_variables } = req.body;
  const { name, level_order, sections } = input.object;
  
  const school_id = session_variables['x-hasura-school-id'];
  if (!school_id) return next(new AppError('Unauthorized', 401));

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. Insert Grade
    const gradeRes = await client.query(
      `INSERT INTO academic.grades (school_id, name, level_order) 
       VALUES ($1, $2, $3) RETURNING id, name`,
      [school_id, name, level_order]
    );
    const grade = gradeRes.rows[0];

    // 2. Insert Sections in Bulk
    // Using map + Promise.all is great, but for even higher scale, 
    // you could use a single unnest query, but this works perfectly for 5-10 sections.
    const createdSections = await Promise.all(
      sections.map(async (sectionName) => {
        const sRes = await client.query(
          `INSERT INTO academic.sections (school_id, grade_id, name) 
           VALUES ($1, $2, $3) RETURNING id, name`,
          [school_id, grade.id, sectionName]
        );
        return sRes.rows[0];
      })
    );

    await client.query('COMMIT');

    // 3. Match the GradeWithSectionsOutput structure
    res.json({
      grade_id: grade.id,
      grade_name: grade.name,
      sections: createdSections
    });

  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return next(new AppError('Grade or Section already exists.', 400));
    }
    return next(new AppError(err.message, 500));
  } finally {
    client.release();
  }
});