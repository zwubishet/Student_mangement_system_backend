import { query, getClient } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { hashPassword } from '../utils/auth.js';
import { audit, AUDIT_ACTIONS } from '../utils/audit.js';
import { mapEmploymentType } from '../constants/staff.js';
import * as staffService from './staffService.js';

const auditTeacher = (actorId, schoolId, action, teacherId, meta = {}) =>
  audit({ userId: actorId, schoolId, action, entity: 'teacher', entityId: teacherId, meta });
import { getPaginationParams } from '../utils/pagination.js';
import { logTeacherActivity } from '../utils/entityActivity.js';

const SORT_COLUMNS = {
  name: 't.last_name',
  email: 't.email',
  hire_date: 't.hire_date',
  created_at: 't.created_at',
  department: 't.department',
};

const buildTeacherFilters = (schoolId, q) => {
  const conditions = ['t.school_id = $1'];
  const params = [schoolId];
  let idx = 2;

  if (q.include_deleted !== 'true') conditions.push('t.deleted_at IS NULL');
  if (q.include_archived !== 'true') conditions.push(`COALESCE(t.status, 'active') != 'archived'`);

  if (q.search) {
    conditions.push(
      `(t.first_name ILIKE $${idx} OR t.last_name ILIKE $${idx} OR t.email ILIKE $${idx}
        OR sp.staff_id_number ILIKE $${idx})`
    );
    params.push(`%${q.search}%`);
    idx++;
  }
  if (q.status) {
    conditions.push(`COALESCE(t.status, u.status) = $${idx++}`);
    params.push(q.status);
  }
  if (q.department) {
    conditions.push(`t.department = $${idx++}`);
    params.push(q.department);
  }
  if (q.employment_type) {
    conditions.push(`t.employment_type = $${idx++}`);
    params.push(q.employment_type);
  }
  if (q.leave_status) {
    conditions.push(`t.leave_status = $${idx++}`);
    params.push(q.leave_status);
  }
  if (q.subject_id) {
    conditions.push(`EXISTS (
      SELECT 1 FROM academic.teacherassignments ta 
      WHERE ta.teacher_id = t.user_id AND ta.subject_id = $${idx}
    )`);
    params.push(q.subject_id);
    idx++;
  }
  if (q.availability === 'true') {
    conditions.push(`EXISTS (
      SELECT 1 FROM academic.teacher_availability av
      WHERE av.teacher_id = t.id AND av.is_available = true
    )`);
  }

  return { conditions, params, idx };
};

export const getTeacherStats = async (schoolId) => {
  const result = await query(
    `SELECT
       COUNT(*) FILTER (WHERE t.deleted_at IS NULL)::int AS total,
       COUNT(*) FILTER (WHERE t.deleted_at IS NULL AND COALESCE(t.status,'active') = 'active')::int AS active,
       COUNT(*) FILTER (WHERE t.status = 'archived')::int AS archived,
       COUNT(*) FILTER (WHERE t.leave_status = 'on_leave')::int AS on_leave,
       COUNT(*) FILTER (WHERE COALESCE(sp.employment_type::text, t.employment_type) IN ('permanent','full_time'))::int AS permanent,
       COUNT(*) FILTER (
         WHERE sp.licence_expiry_date IS NOT NULL
           AND sp.licence_expiry_date <= CURRENT_DATE + INTERVAL '90 days'
           AND sp.is_active = true
       )::int AS licences_expiring_soon
     FROM academic.teachers t
     LEFT JOIN identity.staff_profiles sp ON sp.id = t.staff_profile_id
     WHERE t.school_id = $1`,
    [schoolId]
  );
  return result.rows[0];
};

export const listTeachers = async (schoolId, queryParams) => {
  const { page, limit, offset } = getPaginationParams(queryParams);
  const { conditions, params, idx } = buildTeacherFilters(schoolId, queryParams);
  const where = conditions.join(' AND ');
  const sortCol = SORT_COLUMNS[queryParams.sort] || SORT_COLUMNS.name;
  const order = queryParams.order === 'desc' ? 'DESC' : 'ASC';

  const [rows, countResult] = await Promise.all([
    query(
      `SELECT 
         t.id, t.user_id, t.first_name, t.last_name, t.email, t.phone, t.hire_date,
         t.department, COALESCE(sp.employment_type::text, t.employment_type) AS employment_type,
         t.leave_status, t.status, t.created_at,
         sp.staff_id_number, sp.licence_expiry_date, sp.city, sp.is_active AS staff_is_active,
         COALESCE(u.status, t.status) AS account_status,
         COUNT(DISTINCT ta.section_id)::int AS assigned_sections,
         COUNT(DISTINCT ta.subject_id)::int AS assigned_subjects,
         string_agg(DISTINCT sub.name, ', ') AS subject_names
       FROM academic.teachers t
       LEFT JOIN identity.staff_profiles sp ON sp.id = t.staff_profile_id
       LEFT JOIN identity.users u ON t.user_id = u.id
       LEFT JOIN academic.teacherassignments ta ON ta.teacher_id = t.user_id
       LEFT JOIN academic.subjects sub ON sub.id = ta.subject_id
       WHERE ${where}
       GROUP BY t.id, t.user_id, t.first_name, t.last_name, t.email, t.phone, t.hire_date,
                t.department, sp.employment_type, t.employment_type, t.leave_status, t.status,
                t.created_at, u.status, sp.staff_id_number, sp.licence_expiry_date, sp.city, sp.is_active
       ORDER BY ${sortCol} ${order} NULLS LAST
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    ),
    query(
      `SELECT COUNT(DISTINCT t.id) FROM academic.teachers t
       LEFT JOIN identity.staff_profiles sp ON sp.id = t.staff_profile_id
       LEFT JOIN identity.users u ON t.user_id = u.id
       LEFT JOIN academic.teacherassignments ta ON ta.teacher_id = t.user_id
       WHERE ${where}`,
      params
    ),
  ]);

  return { rows: rows.rows, total: parseInt(countResult.rows[0].count, 10), page, limit };
};

export const getTeacherProfile = async (schoolId, teacherId) => {
  const base = await query(
    `SELECT t.*, u.email, COALESCE(u.status, t.status) AS account_status
     FROM academic.teachers t
     LEFT JOIN identity.users u ON t.user_id = u.id
     WHERE t.school_id = $1 AND t.id = $2 AND t.deleted_at IS NULL`,
    [schoolId, teacherId]
  );
  if (!base.rows[0]) throw new AppError('Teacher not found', 404, ERROR_CODES.NOT_FOUND);

  const includePayroll = true;
  const [staffProfile, contracts, leave, appraisals, cpd, assignments, qualifications, notes, documents, availability, activity] = await Promise.all([
    staffService.getStaffProfileByTeacher(schoolId, teacherId, { includePayroll }).catch(() => null),
    staffService.listStaffContracts(schoolId, teacherId).catch(() => []),
    staffService.listStaffLeave(schoolId, teacherId).catch(() => []),
    staffService.listStaffAppraisals(schoolId, teacherId).catch(() => []),
    staffService.listStaffCpd(schoolId, teacherId).catch(() => []),
    query(
      `SELECT ta.id, sec.id AS section_id, sec.name AS section_name,
              sub.id AS subject_id, sub.name AS subject_name, g.name AS grade_name
       FROM academic.teacherassignments ta
       JOIN academic.sections sec ON sec.id = ta.section_id
       JOIN academic.subjects sub ON sub.id = ta.subject_id
       LEFT JOIN academic.grades g ON g.id = sec.grade_id
       WHERE ta.teacher_id = $1`,
      [base.rows[0].user_id]
    ),
    query(`SELECT * FROM academic.teacher_qualifications WHERE teacher_id = $1 ORDER BY year_obtained DESC`, [teacherId]).catch(() => ({ rows: [] })),
    query(
      `SELECT n.*, u.first_name AS author_first_name, u.last_name AS author_last_name
       FROM academic.teacher_notes n LEFT JOIN identity.users u ON u.id = n.author_id
       WHERE n.teacher_id = $1 ORDER BY n.is_pinned DESC, n.created_at DESC`,
      [teacherId]
    ).catch(() => ({ rows: [] })),
    query(`SELECT * FROM academic.teacher_documents WHERE teacher_id = $1 ORDER BY created_at DESC`, [teacherId]).catch(() => ({ rows: [] })),
    query(`SELECT * FROM academic.teacher_availability WHERE teacher_id = $1 ORDER BY day_of_week`, [teacherId]).catch(() => ({ rows: [] })),
    query(
      `SELECT al.*, u.first_name, u.last_name FROM academic.teacher_activity_logs al
       LEFT JOIN identity.users u ON u.id = al.actor_id
       WHERE al.teacher_id = $1 ORDER BY al.created_at DESC LIMIT 50`,
      [teacherId]
    ).catch(() => ({ rows: [] })),
  ]);

  return {
    ...base.rows[0],
    ...(staffProfile || {}),
    staff_profile: staffProfile,
    contracts,
    leave_records: leave,
    appraisals,
    cpd_records: cpd,
    assignments: assignments.rows,
    qualifications: qualifications.rows,
    notes: notes.rows,
    documents: documents.rows,
    availability: availability.rows,
    activity: activity.rows,
    workload: {
      sections: assignments.rows.length,
      subjects: new Set(assignments.rows.map((a) => a.subject_id)).size,
    },
  };
};

export const getTeacherById = async (schoolId, teacherId) => getTeacherProfile(schoolId, teacherId);

export const createTeacher = async (data, schoolId, actorId) => {
  const {
    first_name, last_name, email, phone, hire_date,
    department, employment_type, qualification_summary, address, home_address,
    staff_id_number, teaching_licence_number, licence_expiry_date, specialisation_subjects,
    date_of_birth, gender, nationality, religion, city, region,
    emergency_contact_name, emergency_contact_phone, emergency_contact_rel,
    highest_degree, degree_subject, university_name, graduation_year, years_of_experience,
  } = data;
  const staffIdNum = staff_id_number || data.staff_id || `STAFF-${Date.now().toString(36).toUpperCase()}`;
  const hireDate = hire_date || new Date().toISOString().slice(0, 10);
  const empType = mapEmploymentType(employment_type);
  const client = await getClient();

  try {
    await client.query('BEGIN');
    const hashedPw = await hashPassword(data.password || 'Teacher123!');
    const userRes = await client.query(
      `INSERT INTO identity.users (email, first_name, last_name, school_id, status, password_hash)
       VALUES ($1, $2, $3, $4, 'active', $5) RETURNING id`,
      [email, first_name, last_name, schoolId, hashedPw]
    );
    const userId = userRes.rows[0].id;
    await client.query(
      `INSERT INTO identity.userroles (user_id, role_id)
       SELECT $1, id FROM identity.roles WHERE name = 'TEACHER' LIMIT 1`,
      [userId]
    );

    const staffRes = await client.query(
      `INSERT INTO identity.staff_profiles (
         school_id, user_id, staff_id_number, hire_date, employment_type, department,
         teaching_licence_number, licence_expiry_date, specialisation_subjects,
         date_of_birth, gender, nationality, religion, home_address, city, region,
         emergency_contact_name, emergency_contact_phone, emergency_contact_rel,
         highest_degree, degree_subject, university_name, graduation_year, years_of_experience,
         created_by
       ) VALUES (
         $1,$2,$3,$4,$5::identity.employment_type,$6,$7,$8,$9,$10,$11,$12,$13,
         $14,$15,$16,$17,$18,$19,$20,
         $21::identity.highest_degree,$22,$23,$24,$25
       ) RETURNING id`,
      [
        schoolId, userId, staffIdNum, hireDate, empType, department || null,
        teaching_licence_number || null, licence_expiry_date || null,
        specialisation_subjects || [],
        date_of_birth || null, gender || null, nationality || 'Ethiopian', religion || null,
        home_address || address || null, city || null, region || null,
        emergency_contact_name || null, emergency_contact_phone || null, emergency_contact_rel || null,
        highest_degree || null, degree_subject || null, university_name || null,
        graduation_year || null, years_of_experience ?? 0, actorId,
      ]
    );
    const staffProfileId = staffRes.rows[0].id;

    const teacherRes = await client.query(
      `INSERT INTO academic.teachers (
         school_id, user_id, staff_profile_id, first_name, last_name, email, phone, hire_date,
         department, employment_type, qualification_summary, address, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active') RETURNING id`,
      [
        schoolId, userId, staffProfileId, first_name, last_name, email, phone, hireDate,
        department, empType, qualification_summary, home_address || address,
      ]
    );
    await client.query('COMMIT');

    const teacherId = teacherRes.rows[0].id;
    audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.CREATE, entity: 'teacher', entityId: teacherId });
    logTeacherActivity({ schoolId, teacherId, actorId, action: 'CREATED' });
    return { teacher_id: teacherId, user_id: userId, email };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') throw new AppError('Email already exists.', 409, ERROR_CODES.DUPLICATE_ENTRY);
    throw err;
  } finally {
    client.release();
  }
};

export const updateTeacher = async (schoolId, teacherId, data, actorId) => {
  const teacherAllowed = [
    'first_name', 'last_name', 'phone', 'hire_date', 'department',
    'employment_type', 'leave_status', 'qualification_summary', 'address', 'status',
  ];
  const staffAllowed = [
    'staff_id_number', 'hire_date', 'employment_type', 'department',
    'teaching_licence_number', 'licence_expiry_date', 'specialisation_subjects',
    'date_of_birth', 'gender', 'nationality', 'religion', 'photo_url',
    'home_address', 'city', 'region',
    'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_rel',
    'highest_degree', 'degree_subject', 'university_name', 'graduation_year', 'years_of_experience',
    'additional_certifications', 'previous_schools',
    'bank_name', 'bank_account_number', 'bank_branch',
    'tax_identification_number', 'pension_number', 'payment_method',
    'termination_date', 'termination_reason', 'is_active',
  ];

  const ctx = await query(
    `SELECT staff_profile_id, user_id FROM academic.teachers WHERE school_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [schoolId, teacherId]
  );
  if (!ctx.rows[0]) throw new AppError('Teacher not found.', 404, ERROR_CODES.NOT_FOUND);

  const tFields = [];
  const tParams = [];
  let tIdx = 1;
  for (const key of teacherAllowed) {
    if (data[key] !== undefined) {
      tFields.push(`${key} = $${tIdx++}`);
      tParams.push(key === 'employment_type' ? mapEmploymentType(data[key]) : data[key]);
    }
  }
  if (data.home_address !== undefined && data.address === undefined) {
    tFields.push(`address = $${tIdx++}`);
    tParams.push(data.home_address);
  }

  const sFields = [];
  const sParams = [];
  let sIdx = 1;
  for (const key of staffAllowed) {
    if (data[key] !== undefined) {
      if (key === 'employment_type') {
        sFields.push(`${key} = $${sIdx++}::identity.employment_type`);
        sParams.push(mapEmploymentType(data[key]));
      } else if (key === 'highest_degree') {
        sFields.push(`${key} = $${sIdx++}::identity.highest_degree`);
        sParams.push(data[key]);
      } else if (key === 'additional_certifications' || key === 'previous_schools') {
        sFields.push(`${key} = $${sIdx++}::jsonb`);
        sParams.push(JSON.stringify(data[key]));
      } else {
        sFields.push(`${key} = $${sIdx++}`);
        sParams.push(data[key]);
      }
    }
  }
  if (data.first_name !== undefined) {
    await query(`UPDATE identity.users SET first_name = $1 WHERE id = $2`, [data.first_name, ctx.rows[0].user_id]);
  }
  if (data.last_name !== undefined) {
    await query(`UPDATE identity.users SET last_name = $1 WHERE id = $2`, [data.last_name, ctx.rows[0].user_id]);
  }

  if (!tFields.length && !sFields.length) {
    throw new AppError('No valid fields to update.', 400, ERROR_CODES.VALIDATION_ERROR);
  }

  if (tFields.length) {
    tParams.push(schoolId, teacherId);
    await query(
      `UPDATE academic.teachers SET ${tFields.join(', ')}, updated_at = NOW()
       WHERE school_id = $${tIdx++} AND id = $${tIdx}`,
      tParams
    );
  }
  let staffProfileId = ctx.rows[0].staff_profile_id;
  if (!staffProfileId && (sFields.length || data.staff_id_number)) {
    const teacherRow = await query(
      `SELECT user_id, hire_date, department, employment_type, address, email
       FROM academic.teachers WHERE id = $1`,
      [teacherId]
    );
    const t = teacherRow.rows[0];
    const ins = await query(
      `INSERT INTO identity.staff_profiles (
         school_id, user_id, staff_id_number, hire_date, employment_type, department, home_address, created_by
       ) VALUES ($1,$2,$3,$4,$5::identity.employment_type,$6,$7,$8) RETURNING id`,
      [
        schoolId,
        t.user_id,
        data.staff_id_number || `STAFF-${teacherId.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
        data.hire_date || t.hire_date || new Date().toISOString().slice(0, 10),
        mapEmploymentType(data.employment_type || t.employment_type),
        data.department ?? t.department,
        data.home_address || data.address || t.address,
        actorId,
      ]
    );
    staffProfileId = ins.rows[0].id;
    await query(
      `UPDATE academic.teachers SET staff_profile_id = $1 WHERE id = $2`,
      [staffProfileId, teacherId]
    );
  }

  if (sFields.length && staffProfileId) {
    sParams.push(staffProfileId, schoolId);
    await query(
      `UPDATE identity.staff_profiles SET ${sFields.join(', ')}, updated_at = NOW()
       WHERE id = $${sIdx++} AND school_id = $${sIdx}`,
      sParams
    );
  }

  auditTeacher(actorId, schoolId, AUDIT_ACTIONS.UPDATE, teacherId, data);
  logTeacherActivity({ schoolId, teacherId, actorId, action: 'UPDATED', meta: data });
  return { id: teacherId };
};

export const archiveTeacher = async (schoolId, teacherId, actorId) => {
  const result = await query(
    `UPDATE academic.teachers SET status = 'archived', archived_at = NOW(), updated_at = NOW()
     WHERE school_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING id`,
    [schoolId, teacherId]
  );
  if (!result.rows[0]) throw new AppError('Teacher not found.', 404, ERROR_CODES.NOT_FOUND);
  auditTeacher(actorId, schoolId, AUDIT_ACTIONS.UPDATE, teacherId, { status: 'archived' });
  logTeacherActivity({ schoolId, teacherId, actorId, action: 'ARCHIVED' });
  return result.rows[0];
};

export const restoreTeacher = async (schoolId, teacherId, actorId) => {
  const result = await query(
    `UPDATE academic.teachers SET status = 'active', archived_at = NULL, updated_at = NOW()
     WHERE school_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING id`,
    [schoolId, teacherId]
  );
  if (!result.rows[0]) throw new AppError('Teacher not found.', 404, ERROR_CODES.NOT_FOUND);
  logTeacherActivity({ schoolId, teacherId, actorId, action: 'RESTORED' });
  return result.rows[0];
};

export const softDeleteTeacher = async (schoolId, teacherId, actorId) => {
  const result = await query(
    `UPDATE academic.teachers SET deleted_at = NOW(), status = 'deleted', updated_at = NOW()
     WHERE school_id = $1 AND id = $2 RETURNING id`,
    [schoolId, teacherId]
  );
  if (!result.rows[0]) throw new AppError('Teacher not found.', 404, ERROR_CODES.NOT_FOUND);
  logTeacherActivity({ schoolId, teacherId, actorId, action: 'SOFT_DELETED' });
  return result.rows[0];
};

export const bulkTeacherAction = async (schoolId, { ids, action }, actorId) => {
  if (!ids?.length) throw new AppError('No teachers selected.', 400, ERROR_CODES.VALIDATION_ERROR);
  const map = {
    archive: `status = 'archived', archived_at = NOW()`,
    restore: `status = 'active', archived_at = NULL`,
    activate: `status = 'active'`,
    suspend: `status = 'suspended'`,
  };
  const setClause = map[action];
  if (!setClause) throw new AppError('Invalid bulk action.', 400, ERROR_CODES.VALIDATION_ERROR);

  await query(
    `UPDATE academic.teachers SET ${setClause}, updated_at = NOW()
     WHERE school_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL`,
    [schoolId, ids]
  );
  for (const id of ids) {
    auditTeacher(actorId, schoolId, AUDIT_ACTIONS.UPDATE, id, { bulk: action });
    logTeacherActivity({ schoolId, teacherId: id, actorId, action: `BULK_${action.toUpperCase()}` });
  }
  return { updated: ids.length };
};

export const addTeacherNote = async (schoolId, teacherId, { body, is_pinned }, actorId) => {
  const result = await query(
    `INSERT INTO academic.teacher_notes (school_id, teacher_id, author_id, body, is_pinned)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [schoolId, teacherId, actorId, body, is_pinned || false]
  );
  logTeacherActivity({ schoolId, teacherId, actorId, action: 'NOTE_ADDED' });
  return result.rows[0];
};

export const addTeacherQualification = async (schoolId, teacherId, data, actorId) => {
  const result = await query(
    `INSERT INTO academic.teacher_qualifications (school_id, teacher_id, title, institution, year_obtained)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [schoolId, teacherId, data.title, data.institution, data.year_obtained]
  );
  logTeacherActivity({ schoolId, teacherId, actorId, action: 'QUALIFICATION_ADDED' });
  return result.rows[0];
};

export const importTeachers = async (schoolId, rows, actorId) => {
  if (!rows?.length) throw new AppError('No rows to import.', 400, ERROR_CODES.VALIDATION_ERROR);

  const results = { imported: 0, failed: [] };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      await createTeacher(
        {
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
          phone: row.phone,
          department: row.department,
          employment_type: row.employment_type || 'full_time',
          password: row.password,
        },
        schoolId,
        actorId
      );
      results.imported += 1;
    } catch (err) {
      results.failed.push({ row: i + 2, message: err.message || 'Import failed' });
    }
  }
  return results;
};

export const exportTeachersCsv = async (schoolId, queryParams) => {
  const { rows } = await listTeachers(schoolId, { ...queryParams, page: 1, limit: 10000 });
  const header = 'staff_id_number,first_name,last_name,email,phone,department,employment_type,status,sections\n';
  const lines = rows.map((r) =>
    [r.staff_id_number, r.first_name, r.last_name, r.email, r.phone, r.department, r.employment_type, r.status, r.assigned_sections]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
  );
  return header + lines.join('\n');
};

export const listTeacherDepartments = async (schoolId) => {
  const result = await query(
    `SELECT DISTINCT department FROM academic.teachers
     WHERE school_id = $1 AND department IS NOT NULL AND department <> '' AND deleted_at IS NULL
     ORDER BY department`,
    [schoolId]
  );
  return result.rows.map((r) => r.department);
};

export const addTeacherDocument = async (schoolId, teacherId, data, actorId) => {
  const { title, file_url, file_id, doc_type } = data;
  let url = file_url?.trim();
  if (file_id) {
    const f = await query(
      `SELECT file_url FROM infrastructure.files WHERE id = $1 AND school_id = $2 AND status = 'ready'`,
      [file_id, schoolId]
    );
    if (!f.rows[0]) throw new AppError('Uploaded file not found or not ready.', 400, ERROR_CODES.NOT_FOUND);
    url = f.rows[0].file_url;
  }
  if (!title?.trim() || !url) {
    throw new AppError('Title and file are required.', 400, ERROR_CODES.VALIDATION_ERROR);
  }
  const result = await query(
    `INSERT INTO academic.teacher_documents (school_id, teacher_id, title, file_url, doc_type, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [schoolId, teacherId, title.trim(), url, doc_type || 'general', actorId]
  ).catch((err) => {
    if (err.code === '42P01') throw new AppError('Documents table not migrated. Run latest DB migration.', 500);
    throw err;
  });
  logTeacherActivity({ schoolId, teacherId, actorId, action: 'DOCUMENT_ADDED', meta: { title } });
  return result.rows[0];
};

export const setTeacherAvailability = async (schoolId, teacherId, slots, actorId) => {
  if (!Array.isArray(slots)) {
    throw new AppError('Availability slots array required.', 400, ERROR_CODES.VALIDATION_ERROR);
  }
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM academic.teacher_availability WHERE teacher_id = $1 AND school_id = $2', [
      teacherId,
      schoolId,
    ]);
    for (const slot of slots) {
      await client.query(
        `INSERT INTO academic.teacher_availability (school_id, teacher_id, day_of_week, start_time, end_time, is_available)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          schoolId,
          teacherId,
          slot.day_of_week,
          slot.start_time,
          slot.end_time,
          slot.is_available !== false,
        ]
      );
    }
    await client.query('COMMIT');
    logTeacherActivity({ schoolId, teacherId, actorId, action: 'AVAILABILITY_UPDATED' });
    const rows = await query(
      `SELECT * FROM academic.teacher_availability WHERE teacher_id = $1 ORDER BY day_of_week, start_time`,
      [teacherId]
    );
    return rows.rows;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
