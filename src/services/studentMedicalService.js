import { query } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { audit, AUDIT_ACTIONS } from '../utils/audit.js';
import { logStudentActivity } from '../utils/entityActivity.js';

const normalizeAllergies = (data) => {
  if (Array.isArray(data.allergies)) return data.allergies;
  if (data.allergies) return String(data.allergies).split(',').map((s) => s.trim()).filter(Boolean);
  return [];
};

const normalizeConditions = (data) => {
  if (Array.isArray(data.conditions)) return data.conditions;
  if (data.chronic_conditions) {
    return String(data.chronic_conditions).split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
};

const normalizeMedications = (data) => {
  if (Array.isArray(data.medications)) return data.medications;
  if (typeof data.medications === 'string' && data.medications.trim()) {
    try {
      const parsed = JSON.parse(data.medications);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

export const getStudentMedical = async (schoolId, studentId) => {
  const result = await query(
    `SELECT *,
       COALESCE(blood_type_enum::text, blood_group) AS blood_type,
       COALESCE(allergies_arr, string_to_array(NULLIF(allergies, ''), ',')) AS allergies_list,
       COALESCE(conditions, string_to_array(NULLIF(chronic_conditions, ''), ',')) AS conditions_list,
       medications_json AS medications
     FROM student.student_medical_records WHERE student_id = $1 AND school_id = $2`,
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

  const allergies = normalizeAllergies(data);
  const conditions = normalizeConditions(data);
  const medications = normalizeMedications(data);
  const bloodType = data.blood_type || data.blood_group || 'unknown';

  const result = await query(
    `INSERT INTO student.student_medical_records (
       school_id, student_id, allergies, allergies_arr, medications, medications_json,
       chronic_conditions, conditions, blood_group, blood_type_enum,
       insurance_provider, insurance_number, physician_name, physician_phone,
       emergency_notes, last_checkup_date, vaccination_notes, last_updated_by, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::student.blood_type,$11,$12,$13,$14,$15,$16,$17,$18,NOW())
     ON CONFLICT (student_id) DO UPDATE SET
       allergies = EXCLUDED.allergies,
       allergies_arr = EXCLUDED.allergies_arr,
       medications = EXCLUDED.medications,
       medications_json = EXCLUDED.medications_json,
       chronic_conditions = EXCLUDED.chronic_conditions,
       conditions = EXCLUDED.conditions,
       blood_group = EXCLUDED.blood_group,
       blood_type_enum = EXCLUDED.blood_type_enum,
       insurance_provider = EXCLUDED.insurance_provider,
       insurance_number = EXCLUDED.insurance_number,
       physician_name = EXCLUDED.physician_name,
       physician_phone = EXCLUDED.physician_phone,
       emergency_notes = EXCLUDED.emergency_notes,
       last_checkup_date = EXCLUDED.last_checkup_date,
       vaccination_notes = EXCLUDED.vaccination_notes,
       last_updated_by = EXCLUDED.last_updated_by,
       updated_at = NOW()
     RETURNING *`,
    [
      schoolId,
      studentId,
      allergies.join(', ') || null,
      allergies,
      typeof data.medications === 'string' ? data.medications : JSON.stringify(medications),
      JSON.stringify(medications),
      conditions.join(', ') || null,
      conditions,
      bloodType,
      bloodType,
      data.insurance_provider || null,
      data.insurance_number || null,
      data.physician_name || null,
      data.physician_phone || null,
      data.emergency_notes || null,
      data.last_checkup_date || null,
      data.vaccination_notes || null,
      actorId,
    ]
  ).catch((err) => {
    if (err.code === '42P01') throw new AppError('Medical table not migrated. Run latest migration.', 500);
    throw err;
  });

  audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.UPDATE, entity: 'student_medical', entityId: studentId });
  logStudentActivity({ schoolId, studentId, actorId, action: 'MEDICAL_UPDATED' });
  return result.rows[0];
};
