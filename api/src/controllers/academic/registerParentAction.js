import { getClient } from '../../config/db.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';
import bcrypt from 'bcryptjs';

export const handleRegisterParentAction = catchAsync(async (req, res, next) => {
  const { input, session_variables } = req.body;
  const { first_name, last_name, email, phone, password, relationship, student_ids } = input.object;
  const school_id = session_variables['x-hasura-school-id'];

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. TENANT-SPECIFIC ROLE CHECK
    // Ensure the 'PARENT' role exists for THIS specific school
    const roleRes = await client.query(
      `INSERT INTO identity.roles (name, school_id) 
       VALUES ('PARENT', $1) 
       ON CONFLICT (name, school_id) DO UPDATE SET name = EXCLUDED.name 
       RETURNING id`,
      [school_id]
    );
    const roleId = roleRes.rows[0].id;

    // 2. IDENTITY UPSERT
    // Use Phone as the global unique key (Identity)
    const hashedPw = await bcrypt.hash(password || 'Parent123!', 12);
    const userRes = await client.query(
      `INSERT INTO identity.users (phone, email, password_hash, first_name, last_name, status) 
       VALUES ($1, $2, $3, $4, $5, 'active')
       ON CONFLICT (phone) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [phone, email || null, hashedPw, first_name, last_name]
    );
    const userId = userRes.rows[0].id;

    // 3. LINK USER TO SCHOOL ROLE
    await client.query(
      `INSERT INTO identity.userroles (user_id, role_id) 
       VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
      [userId, roleId]
    );

    // 4. CREATE PARENT PROFILE (The "Persona" in this school)
    const parentRes = await client.query(
      `INSERT INTO academic.parents (school_id, user_id, first_name, last_name, email, phone, relationship)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, school_id) DO UPDATE SET relationship = EXCLUDED.relationship
       RETURNING id`,
      [school_id, userId, first_name, last_name, email, phone, relationship]
    );
    const parentId = parentRes.rows[0].id;

    // 5. LINK SIBLINGS
    let linksCreated = 0;
    for (const studentId of student_ids) {
      const studentCheck = await client.query(
        `SELECT id FROM student.students WHERE id = $1 AND school_id = $2`,
        [studentId, school_id]
      );

      if (studentCheck.rows.length > 0) {
        await client.query(
          `INSERT INTO academic.parentstudents (school_id, parent_id, student_id)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [school_id, parentId, studentId]
        );
        linksCreated++;
      }
    }

    await client.query('COMMIT');
    res.json({ parent_id: parentId, user_id: userId, links_created: linksCreated });

  } catch (err) {
    await client.query('ROLLBACK');
    return next(new AppError(err.message, 400));
  } finally {
    client.release();
  }
});