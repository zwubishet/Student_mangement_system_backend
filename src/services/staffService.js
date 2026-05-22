import { query } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { audit, AUDIT_ACTIONS } from '../utils/audit.js';
import { logTeacherActivity } from '../utils/entityActivity.js';

export const ensureStaffProfileForTeacher = async (schoolId, teacherId, actorId) => {
  const r = await query(
    `SELECT t.id AS teacher_id, t.user_id, t.hire_date, t.department, t.employment_type, t.address,
            t.staff_profile_id, sp.id AS staff_id
     FROM academic.teachers t
     LEFT JOIN identity.staff_profiles sp ON sp.id = t.staff_profile_id AND sp.is_deleted = false
     WHERE t.school_id = $1 AND t.id = $2 AND t.deleted_at IS NULL`,
    [schoolId, teacherId]
  );
  if (!r.rows[0]) throw new AppError('Teacher not found.', 404, ERROR_CODES.NOT_FOUND);
  if (r.rows[0].staff_id) {
    return { teacher_id: r.rows[0].teacher_id, staff_id: r.rows[0].staff_id };
  }

  const t = r.rows[0];
  const ins = await query(
    `INSERT INTO identity.staff_profiles (
       school_id, user_id, staff_id_number, hire_date, employment_type, department, home_address, created_by
     ) VALUES ($1,$2,$3,$4,$5::identity.employment_type,$6,$7,$8) RETURNING id`,
    [
      schoolId,
      t.user_id,
      `STAFF-${String(teacherId).replace(/-/g, '').slice(0, 8).toUpperCase()}`,
      t.hire_date || new Date().toISOString().slice(0, 10),
      (t.employment_type === 'full_time' ? 'permanent' : t.employment_type) || 'permanent',
      t.department,
      t.address,
      actorId,
    ]
  );
  const staffId = ins.rows[0].id;
  await query(`UPDATE academic.teachers SET staff_profile_id = $1 WHERE id = $2`, [staffId, teacherId]);
  return { teacher_id: teacherId, staff_id: staffId };
};

export const resolveStaffContext = async (schoolId, teacherId, actorId = null) => {
  if (actorId) {
    return ensureStaffProfileForTeacher(schoolId, teacherId, actorId);
  }
  const r = await query(
    `SELECT t.id AS teacher_id, t.user_id, sp.id AS staff_id
     FROM academic.teachers t
     LEFT JOIN identity.staff_profiles sp ON sp.id = t.staff_profile_id OR sp.user_id = t.user_id
     WHERE t.school_id = $1 AND t.id = $2 AND t.deleted_at IS NULL`,
    [schoolId, teacherId]
  );
  if (!r.rows[0]) throw new AppError('Teacher not found.', 404, ERROR_CODES.NOT_FOUND);
  if (!r.rows[0].staff_id) {
    throw new AppError(
      'No staff HR profile yet. Save payroll & employment details on the teacher profile first.',
      400
    );
  }
  return r.rows[0];
};

const staffProfileSelect = `
  sp.id AS staff_profile_id, sp.staff_id_number, sp.hire_date, sp.employment_type::text AS employment_type,
  sp.department, sp.teaching_licence_number, sp.licence_expiry_date, sp.specialisation_subjects,
  sp.date_of_birth, sp.gender, sp.nationality, sp.religion, sp.photo_url,
  sp.home_address, sp.city, sp.region,
  sp.emergency_contact_name, sp.emergency_contact_phone, sp.emergency_contact_rel,
  sp.highest_degree::text AS highest_degree, sp.degree_subject, sp.university_name,
  sp.graduation_year, sp.years_of_experience, sp.additional_certifications, sp.previous_schools,
  sp.is_active AS staff_is_active, sp.termination_date, sp.termination_reason
`;

const payrollSelect = `
  sp.bank_name, sp.bank_account_number, sp.bank_branch,
  sp.tax_identification_number, sp.pension_number, sp.payment_method
`;

export const getStaffProfileByTeacher = async (schoolId, teacherId, { includePayroll = false } = {}) => {
  const cols = includePayroll ? `${staffProfileSelect}, ${payrollSelect}` : staffProfileSelect;
  const r = await query(
    `SELECT ${cols}
     FROM academic.teachers t
     JOIN identity.staff_profiles sp ON sp.id = t.staff_profile_id
     WHERE t.school_id = $1 AND t.id = $2 AND sp.is_deleted = false`,
    [schoolId, teacherId]
  );
  return r.rows[0] || null;
};

export const listStaffContracts = async (schoolId, teacherId) => {
  const { staff_id } = await resolveStaffContext(schoolId, teacherId);
  const r = await query(
    `SELECT c.*, ay.name AS academic_year_name
     FROM identity.staff_contracts c
     LEFT JOIN academic.academicyears ay ON ay.id = c.academic_year_id
     WHERE c.staff_id = $1 AND c.school_id = $2
     ORDER BY c.start_date DESC`,
    [staff_id, schoolId]
  );
  return r.rows;
};

export const createStaffContract = async (schoolId, teacherId, data, actorId) => {
  const { staff_id, teacher_id } = await ensureStaffProfileForTeacher(schoolId, teacherId, actorId);
  const r = await query(
    `INSERT INTO identity.staff_contracts (
       school_id, staff_id, academic_year_id, contract_type, salary_amount, currency,
       start_date, end_date, signed_at, signed_document_url, notes, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [
      schoolId, staff_id, data.academic_year_id, data.contract_type,
      data.salary_amount ?? null, data.currency || 'ETB',
      data.start_date, data.end_date || null, data.signed_at || null,
      data.signed_document_url || null, data.notes || null, actorId,
    ]
  );
  audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.CREATE, entity: 'staff_contract', entityId: r.rows[0].id });
  logTeacherActivity({ schoolId, teacherId: teacher_id, actorId, action: 'CONTRACT_ADDED' });
  return r.rows[0];
};

export const listStaffLeave = async (schoolId, teacherId) => {
  const { staff_id } = await resolveStaffContext(schoolId, teacherId);
  const r = await query(
    `SELECT l.*,
            sub.staff_id_number AS substitute_staff_id,
            u.first_name AS approved_by_first_name, u.last_name AS approved_by_last_name
     FROM identity.staff_leave l
     LEFT JOIN identity.staff_profiles sub ON sub.id = l.substitute_id
     LEFT JOIN identity.users u ON u.id = l.approved_by
     WHERE l.staff_id = $1 AND l.school_id = $2
     ORDER BY l.from_date DESC`,
    [staff_id, schoolId]
  );
  return r.rows;
};

export const createStaffLeave = async (schoolId, teacherId, data, actorId) => {
  const { staff_id, teacher_id } = await ensureStaffProfileForTeacher(schoolId, teacherId, actorId);
  const from = new Date(data.from_date);
  const to = new Date(data.to_date);
  const days = data.days_count ?? (Math.floor((to - from) / 86400000) + 1);

  const r = await query(
    `INSERT INTO identity.staff_leave (
       school_id, staff_id, leave_type, from_date, to_date, days_count, reason,
       status, substitute_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8) RETURNING *`,
    [schoolId, staff_id, data.leave_type, data.from_date, data.to_date, days, data.reason || null, data.substitute_id || null]
  );
  await query(
    `UPDATE academic.teachers SET leave_status = 'on_leave', updated_at = NOW()
     WHERE id = $1 AND $2::date <= CURRENT_DATE AND $3::date >= CURRENT_DATE`,
    [teacher_id, data.from_date, data.to_date]
  ).catch(() => {});
  logTeacherActivity({ schoolId, teacherId: teacher_id, actorId, action: 'LEAVE_REQUESTED' });
  return r.rows[0];
};

export const updateStaffLeaveStatus = async (schoolId, teacherId, leaveId, data, actorId) => {
  const { staff_id, teacher_id } = await resolveStaffContext(schoolId, teacherId);
  const r = await query(
    `UPDATE identity.staff_leave SET
       status = COALESCE($4, status),
       approved_by = CASE WHEN $4 IN ('approved','rejected') THEN $5 ELSE approved_by END,
       approved_at = CASE WHEN $4 IN ('approved','rejected') THEN NOW() ELSE approved_at END,
       rejection_reason = COALESCE($6, rejection_reason),
       updated_at = NOW()
     WHERE id = $1 AND staff_id = $2 AND school_id = $3
     RETURNING *`,
    [leaveId, staff_id, schoolId, data.status, actorId, data.rejection_reason || null]
  );
  if (!r.rows[0]) throw new AppError('Leave record not found.', 404, ERROR_CODES.NOT_FOUND);
  logTeacherActivity({ schoolId, teacherId: teacher_id, actorId, action: `LEAVE_${data.status?.toUpperCase()}` });
  return r.rows[0];
};

export const listStaffAppraisals = async (schoolId, teacherId) => {
  const { staff_id } = await resolveStaffContext(schoolId, teacherId);
  const r = await query(
    `SELECT a.*, ay.name AS academic_year_name,
            u.first_name AS appraiser_first_name, u.last_name AS appraiser_last_name
     FROM identity.staff_appraisals a
     LEFT JOIN academic.academicyears ay ON ay.id = a.academic_year_id
     LEFT JOIN identity.users u ON u.id = a.appraised_by
     WHERE a.staff_id = $1 AND a.school_id = $2
     ORDER BY a.appraisal_date DESC`,
    [staff_id, schoolId]
  );
  return r.rows;
};

export const createStaffAppraisal = async (schoolId, teacherId, data, actorId) => {
  const { staff_id, teacher_id } = await resolveStaffContext(schoolId, teacherId);
  const r = await query(
    `INSERT INTO identity.staff_appraisals (
       school_id, staff_id, academic_year_id, appraisal_date, appraised_by,
       scores, overall_rating, strengths, areas_to_improve, action_plan
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::identity.appraisal_rating,$8,$9,$10) RETURNING *`,
    [
      schoolId, staff_id, data.academic_year_id, data.appraisal_date, actorId,
      JSON.stringify(data.scores || {}), data.overall_rating,
      data.strengths || null, data.areas_to_improve || null, data.action_plan || null,
    ]
  );
  logTeacherActivity({ schoolId, teacherId: teacher_id, actorId, action: 'APPRAISAL_ADDED' });
  return r.rows[0];
};

export const listStaffCpd = async (schoolId, teacherId) => {
  const { staff_id } = await resolveStaffContext(schoolId, teacherId);
  const r = await query(
    `SELECT c.*, u.first_name AS verifier_first_name, u.last_name AS verifier_last_name
     FROM identity.staff_cpd c
     LEFT JOIN identity.users u ON u.id = c.verified_by
     WHERE c.staff_id = $1 AND c.school_id = $2
     ORDER BY c.activity_date DESC`,
    [staff_id, schoolId]
  );
  return r.rows;
};

export const createStaffCpd = async (schoolId, teacherId, data, actorId) => {
  const { staff_id, teacher_id } = await resolveStaffContext(schoolId, teacherId);
  const r = await query(
    `INSERT INTO identity.staff_cpd (
       school_id, staff_id, activity_name, provider, category, activity_date, hours, certificate_url
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      schoolId, staff_id, data.activity_name, data.provider || null, data.category || null,
      data.activity_date, data.hours, data.certificate_url || null,
    ]
  );
  logTeacherActivity({ schoolId, teacherId: teacher_id, actorId, action: 'CPD_ADDED' });
  return r.rows[0];
};

export const verifyStaffCpd = async (schoolId, teacherId, cpdId, actorId) => {
  const { staff_id, teacher_id } = await resolveStaffContext(schoolId, teacherId);
  const r = await query(
    `UPDATE identity.staff_cpd SET verified = true, verified_by = $4
     WHERE id = $1 AND staff_id = $2 AND school_id = $3 RETURNING *`,
    [cpdId, staff_id, schoolId, actorId]
  );
  if (!r.rows[0]) throw new AppError('CPD record not found.', 404, ERROR_CODES.NOT_FOUND);
  logTeacherActivity({ schoolId, teacherId: teacher_id, actorId, action: 'CPD_VERIFIED' });
  return r.rows[0];
};

export const listExpiringLicences = async (schoolId, withinDays = 90) => {
  const r = await query(
    `SELECT sp.id, sp.staff_id_number, sp.licence_expiry_date, sp.teaching_licence_number,
            t.id AS teacher_id, t.first_name, t.last_name, t.email
     FROM identity.staff_profiles sp
     JOIN academic.teachers t ON t.staff_profile_id = sp.id
     WHERE sp.school_id = $1 AND sp.is_deleted = false AND sp.is_active = true
       AND sp.licence_expiry_date IS NOT NULL
       AND sp.licence_expiry_date <= CURRENT_DATE + ($2 || ' days')::interval
     ORDER BY sp.licence_expiry_date`,
    [schoolId, withinDays]
  );
  return r.rows;
};
