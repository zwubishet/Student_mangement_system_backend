import { getClient } from '../../config/db.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';

export const createClassesBulk = catchAsync(async (req, res, next) => {
  // sections now expects: [{ section_id: "uuid", capacity: 30 }, { section_id: "uuid", capacity: 45 }]
  const { academic_year_id, sections } = req.body; 
  const school_id = req.user.schoolId;

  if (!sections || !Array.isArray(sections)) {
    return next(new AppError('Please provide an array of section objects.', 400));
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // 1. Verify Academic Year
    const yearCheck = await client.query(
      'SELECT id FROM academic.academicyears WHERE id = $1 AND school_id = $2',
      [academic_year_id, school_id]
    );
    if (yearCheck.rows.length === 0) throw new Error('Invalid Academic Year for this school.');

    // 2. Insert Classes with varying capacities
    const classPromises = sections.map(item => {
      return client.query(
        `INSERT INTO academic.classes (school_id, section_id, academic_year_id, capacity)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (section_id, academic_year_id) 
         DO UPDATE SET capacity = EXCLUDED.capacity -- Optional: update capacity if class already exists
         RETURNING *`,
        [
          school_id, 
          item.section_id, 
          academic_year_id, 
          item.capacity || 30 // Fallback to 30 if not provided
        ]
      );
    });

    const results = await Promise.all(classPromises);
    const processedClasses = results.map(r => r.rows[0]).filter(Boolean);

    await client.query('COMMIT');

    res.status(201).json({
      status: 'success',
      results: processedClasses.length,
      data: { classes: processedClasses }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    return next(new AppError(err.message, 500));
  } finally {
    client.release();
  }
});