import { query } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { audit, AUDIT_ACTIONS } from '../utils/audit.js';
import { logStudentActivity } from '../utils/entityActivity.js';

export const getStudentMedical = async (schoolId, studentId) => {
  const result = await query(
    `SELECT * FROM student.student_medical_records WHERE student_id = $1 AND school_id = $2`,
    [studentId, schoolId]
  );
  return result.rows[0] || null;
};

export const upsertStudentMedical = async (schoolId, studentId, data, actorId) => {
  const check = await query(
    `SELECT id FROM student.students WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL`,
    [studentId, schoolId]
  );
  if (!check.rows[0]) throw new AppError('Student not found.', 404, ERROR_CODES.NOT_FOUND);

  const result = await query(
    `INSERT INTO student.student_medical_records (
       school_id, student_id, allergies, medications, chronic_conditions, blood_group,
       insurance_provider, insurance_number, physician_name, physician_phone,
       emergency_notes, last_checkup_date, vaccination_notes, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
     ON CONFLICT (student_id) DO UPDATE SET
       allergies = EXCLUDED.allergies,
       medications = EXCLUDED.medications,
       chronic_conditions = EXCLUDED.chronic_conditions,
       blood_group = EXCLUDED.blood_group,
       insurance_provider = EXCLUDED.insurance_provider,
       insurance_number = EXCLUDED.insurance_number,
       physician_name = EXCLUDED.physician_name,
       physician_phone = EXCLUDED.physician_phone,
       emergency_notes = EXCLUDED.emergency_notes,
       last_checkup_date = EXCLUDED.last_checkup_date,
       vaccination_notes = EXCLUDED.vaccination_notes,
       updated_at = NOW()
     RETURNING *`,
    [
      schoolId,
      studentId,
      data.allergies || null,
      data.medications || null,
      data.chronic_conditions || null,
      data.blood_group || null,
      data.insurance_provider || null,
      data.insurance_number || null,
      data.physician_name || null,
      data.physician_phone || null,
      data.emergency_notes || null,
      data.last_checkup_date || null,
      data.vaccination_notes || null,
    ]
  ).catch((err) => {
    if (err.code === '42P01') throw new AppError('Medical table not migrated. Run latest migration.', 500);
    throw err;
  });

  audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.UPDATE, entity: 'student_medical', entityId: studentId });
  logStudentActivity({ schoolId, studentId, actorId, action: 'MEDICAL_UPDATED' });
  return result.rows[0];
};
