import { getClient } from '../../config/db.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';

export const createClassesBulk = catchAsync(async (req, res, next) => {
  const { input, session_variables } = req.body;
  const { academic_year_id, sections } = input.object;
  
  const school_id = session_variables['x-hasura-school-id'];
  if (!school_id) return next(new AppError('Unauthorized: School context missing.', 401));

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. Multi-tenant Verification
    const yearCheck = await client.query(
      'SELECT id FROM academic.academicyears WHERE id = $1 AND school_id = $2',
      [academic_year_id, school_id]
    );
    if (yearCheck.rows.length === 0) {
        throw new Error('Academic Year not found or access denied.');
    }

    // 2. Batch Processing
    const classResults = await Promise.all(
      sections.map(async (item) => {
        const cRes = await client.query(
          `INSERT INTO academic.classes (school_id, section_id, academic_year_id, capacity)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (section_id, academic_year_id) 
           DO UPDATE SET capacity = EXCLUDED.capacity
           RETURNING id, section_id, academic_year_id, capacity`,
          [school_id, item.section_id, academic_year_id, item.capacity || 30]
        );
        return cRes.rows[0];
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