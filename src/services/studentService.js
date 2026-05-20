import { query, getClient } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { hashPassword } from '../utils/auth.js';
import { audit, AUDIT_ACTIONS } from '../utils/audit.js';
import { getPaginationParams } from '../utils/pagination.js';
import { logStudentActivity } from '../utils/entityActivity.js';

const SORT_COLUMNS = {
  name: 's.last_name',
  admission_number: 's.admission_number',
  created_at: 's.created_at',
  enrolled_at: 'se.enrolled_at',
  grade: 'g.name',
};

const parseGuardianName = (g) => {
  if (g.first_name?.trim()) {
    return { first_name: g.first_name.trim(), last_name: (g.last_name || '').trim() };
  }
  const parts = (g.full_name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: 'Guardian', last_name: '' };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
};

const insertGuardianLink = async (client, schoolId, studentId, g) => {
  const { first_name, last_name } = parseGuardianName(g);
  const gRes = await client.query(
    `INSERT INTO student.guardians (school_id, first_name, last_name, relationship, phone_primary, phone_secondary, email, occupation)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      schoolId,
      first_name,
      last_name,
      g.relationship,
      g.phone_primary || g.phone || null,
      g.phone_secondary || null,
      g.email || null,
      g.occupation || null,
    ]
  );
  await client.query(
    `INSERT INTO student.guardian_links (student_id, guardian_id, is_primary, is_emergency, can_pickup)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (student_id, guardian_id) DO NOTHING`,
    [studentId, gRes.rows[0].id, !!g.is_primary, !!g.is_emergency, g.can_pickup !== false]
  );
};

const resolveClassId = async (client, schoolId, sectionId, academicYearId, classId) => {
  if (classId) return classId;
  const c = await client.query(
    `SELECT id FROM academic.classes WHERE section_id = $1 AND academic_year_id = $2 AND school_id = $3 LIMIT 1`,
    [sectionId, academicYearId, schoolId]
  );
  return c.rows[0]?.id || null;
};

const upsertMedicalInTx = async (client, schoolId, studentId, medical, actorId) => {
  if (!medical) return;
  const allergies = Array.isArray(medical.allergies)
    ? medical.allergies
    : (medical.allergies ? String(medical.allergies).split(',').map((s) => s.trim()).filter(Boolean) : []);
  const conditions = Array.isArray(medical.conditions)
    ? medical.conditions
    : (medical.chronic_conditions
      ? String(medical.chronic_conditions).split(',').map((s) => s.trim()).filter(Boolean)
      : []);
  const meds = Array.isArray(medical.medications) ? medical.medications : [];
  const bloodType = medical.blood_type || medical.blood_group || 'unknown';

  await client.query(
    `INSERT INTO student.student_medical_records (
       school_id, student_id, allergies, allergies_arr, conditions, medications_json,
       blood_group, blood_type_enum, emergency_notes, last_updated_by, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::student.blood_type,$9,$10,NOW())
     ON CONFLICT (student_id) DO UPDATE SET
       allergies = EXCLUDED.allergies,
       allergies_arr = EXCLUDED.allergies_arr,
       conditions = EXCLUDED.conditions,
       medications_json = EXCLUDED.medications_json,
       blood_group = EXCLUDED.blood_group,
       blood_type_enum = EXCLUDED.blood_type_enum,
       emergency_notes = EXCLUDED.emergency_notes,
       last_updated_by = EXCLUDED.last_updated_by,
       updated_at = NOW()`,
    [
      schoolId,
      studentId,
      allergies.join(', ') || null,
      allergies,
      conditions,
      JSON.stringify(meds),
      bloodType,
      bloodType,
      medical.emergency_notes || null,
      actorId,
    ]
  ).catch(() => {});
};

const buildListFilters = (schoolId, q) => {
  const conditions = ['s.school_id = $1'];
  const params = [schoolId];
  let idx = 2;

  if (q.include_deleted !== 'true') conditions.push('s.deleted_at IS NULL');
  if (q.include_archived !== 'true') conditions.push(`s.lifecycle_status != 'archived'`);

  if (q.search) {
    conditions.push(
      `(s.first_name ILIKE $${idx} OR s.last_name ILIKE $${idx} OR s.middle_name ILIKE $${idx}
        OR s.admission_number ILIKE $${idx} OR s.student_id_number ILIKE $${idx} OR u.email ILIKE $${idx})`
    );
    params.push(`%${q.search}%`);
    idx++;
  }
  if (q.status) {
    conditions.push(`COALESCE(s.lifecycle_status, u.status) = $${idx++}`);
    params.push(q.status);
  }
  if (q.gender) {
    conditions.push(`s.gender = $${idx++}`);
    params.push(q.gender);
  }
  if (q.section_id) {
    conditions.push(`se.section_id = $${idx++}`);
    params.push(q.section_id);
  }
  if (q.academic_year_id) {
    conditions.push(`se.academic_year_id = $${idx++}`);
    params.push(q.academic_year_id);
  }
  if (q.grade_id) {
    conditions.push(`g.id = $${idx++}`);
    params.push(q.grade_id);
  }
  if (q.enrolled_from) {
    conditions.push(`se.enrolled_at >= $${idx++}`);
    params.push(q.enrolled_from);
  }
  if (q.enrolled_to) {
    conditions.push(`se.enrolled_at <= $${idx++}`);
    params.push(q.enrolled_to);
  }
  if (q.tag_id) {
    conditions.push(`EXISTS (
      SELECT 1 FROM student.student_tag_map stm
      WHERE stm.student_id = s.id AND stm.tag_id = $${idx}
    )`);
    params.push(q.tag_id);
    idx++;
  }

  return { conditions, params, idx };
};

const listFromClause = `
  FROM student.students s
  JOIN identity.users u ON s.user_id = u.id
  LEFT JOIN student.studentenrollments se ON se.student_id = s.id AND se.status = 'active'
  LEFT JOIN academic.sections sec ON sec.id = se.section_id
  LEFT JOIN academic.classes c ON c.section_id = sec.id AND c.academic_year_id = se.academic_year_id
  LEFT JOIN academic.grades g ON g.id = c.grade_id
  LEFT JOIN academic.academicyears ay ON ay.id = se.academic_year_id
`;

export const getStudentStats = async (schoolId) => {
  const result = await query(
    `SELECT
       COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS total,
       COUNT(*) FILTER (WHERE deleted_at IS NULL AND lifecycle_status = 'active')::int AS active,
       COUNT(*) FILTER (WHERE lifecycle_status = 'archived')::int AS archived,
       COUNT(*) FILTER (WHERE gender = 'male' AND deleted_at IS NULL)::int AS male,
       COUNT(*) FILTER (WHERE gender = 'female' AND deleted_at IS NULL)::int AS female,
       COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW()) AND deleted_at IS NULL)::int AS new_this_month
     FROM student.students WHERE school_id = $1`,
    [schoolId]
  );
  return result.rows[0];
};

export const listStudents = async (schoolId, queryParams) => {
  const { page, limit, offset } = getPaginationParams(queryParams);
  const { conditions, params, idx } = buildListFilters(schoolId, queryParams);
  const where = conditions.join(' AND ');
  const sortCol = SORT_COLUMNS[queryParams.sort] || SORT_COLUMNS.name;
  const order = queryParams.order === 'desc' ? 'DESC' : 'ASC';

  const [rows, countResult] = await Promise.all([
    query(
      `SELECT 
         s.id, s.admission_number, COALESCE(s.student_id_number, s.admission_number) AS student_id_number,
         s.first_name, s.middle_name, s.last_name, s.gender, s.date_of_birth,
         s.city, s.region, s.is_active, s.lifecycle_status, s.created_at, s.archived_at,
         u.email, u.status AS account_status,
         se.section_id, sec.name AS section_name, se.class_id, se.roll_number,
         c.name AS class_name, g.name AS grade_name, g.id AS grade_id,
         ay.name AS academic_year, ay.id AS academic_year_id,
         se.enrolled_at
       ${listFromClause}
       WHERE ${where}
       ORDER BY ${sortCol} ${order} NULLS LAST
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    ),
    query(
      `SELECT COUNT(DISTINCT s.id) ${listFromClause} WHERE ${where}`,
      params
    ),
  ]);

  return { rows: rows.rows, total: parseInt(countResult.rows[0].count, 10), page, limit };
};

export const getStudentProfile = async (schoolId, studentId) => {
  const base = await query(
    `SELECT 
       s.*, u.email, u.status AS account_status, u.id AS user_id
     FROM student.students s
     JOIN identity.users u ON s.user_id = u.id
     WHERE s.school_id = $1 AND s.id = $2 AND s.deleted_at IS NULL`,
    [schoolId, studentId]
  );
  if (!base.rows[0]) throw new AppError('Student not found', 404, ERROR_CODES.NOT_FOUND);

  const [enrollments, guardians, notes, documents, tags, activity, attendance, medical, exams] = await Promise.all([
    query(
      `SELECT se.*, sec.name AS section_name, ay.name AS academic_year,
              COALESCE(c2.name, c.name) AS class_name, g.name AS grade_name
       FROM student.studentenrollments se
       LEFT JOIN academic.sections sec ON sec.id = se.section_id
       LEFT JOIN academic.academicyears ay ON ay.id = se.academic_year_id
       LEFT JOIN academic.classes c ON c.section_id = se.section_id AND c.academic_year_id = se.academic_year_id
       LEFT JOIN academic.classes c2 ON c2.id = se.class_id
       LEFT JOIN academic.grades g ON g.id = COALESCE(c2.grade_id, c.grade_id)
       WHERE se.student_id = $1 ORDER BY se.enrolled_at DESC`,
      [studentId]
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT g.id, g.first_name, g.last_name,
              trim(g.first_name || ' ' || g.last_name) AS full_name,
              g.relationship, g.phone_primary AS phone, g.phone_secondary, g.email, g.occupation,
              gl.is_primary, gl.is_emergency, gl.can_pickup
       FROM student.guardian_links gl
       JOIN student.guardians g ON g.id = gl.guardian_id AND g.is_deleted = false
       WHERE gl.student_id = $1
       ORDER BY gl.is_primary DESC`,
      [studentId]
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT n.*, u.first_name AS author_first_name, u.last_name AS author_last_name
       FROM student.student_notes n
       LEFT JOIN identity.users u ON u.id = n.author_id
       WHERE n.student_id = $1 ORDER BY n.is_pinned DESC, n.created_at DESC`,
      [studentId]
    ).catch(() => ({ rows: [] })),
    query(`SELECT * FROM student.student_documents WHERE student_id = $1 ORDER BY created_at DESC`, [studentId]).catch(() => ({ rows: [] })),
    query(
      `SELECT t.id, t.name, t.color FROM student.student_tags t
       JOIN student.student_tag_map m ON m.tag_id = t.id WHERE m.student_id = $1`,
      [studentId]
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT al.*, u.first_name, u.last_name FROM student.student_activity_logs al
       LEFT JOIN identity.users u ON u.id = al.actor_id
       WHERE al.student_id = $1 ORDER BY al.created_at DESC LIMIT 50`,
      [studentId]
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT status, COUNT(*)::int AS count FROM academic.attendance
       WHERE student_id = $1 GROUP BY status`,
      [studentId]
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT * FROM student.student_medical_records WHERE student_id = $1 AND school_id = $2`,
      [studentId, schoolId]
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT AVG(er.score)::numeric(5,2) AS avg_score, COUNT(*)::int AS exam_count
       FROM operations.examresults er WHERE er.student_id = $1`,
      [studentId]
    ).catch(() => ({ rows: [{ avg_score: null, exam_count: 0 }] })),
  ]);

  const active = enrollments.rows.find((e) => e.status === 'active') || enrollments.rows[0];

  return {
    ...base.rows[0],
    active_enrollment: active,
    enrollments: enrollments.rows,
    guardians: guardians.rows,
    notes: notes.rows,
    documents: documents.rows,
    tags: tags.rows,
    activity: activity.rows,
    attendance_summary: attendance.rows,
    exam_summary: exams.rows[0],
    medical: medical.rows[0] || null,
  };
};

export const getStudentById = async (schoolId, studentId) => getStudentProfile(schoolId, studentId);

export const registerAndEnrollStudent = async (data, schoolId, actorId) => {
  const {
    email, password, first_name, middle_name, last_name, first_name_local, last_name_local,
    gender, date_of_birth, section_id, academic_year_id, class_id, roll_number,
    phone, address, home_address, city, region, nationality, religion, photo_url, enrollment_date,
    emergency_contact_name, emergency_contact_phone, guardians, medical,
  } = data;
  const admission_number = data.admission_number || data.student_id_number;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const cap = await client.query(
      `SELECT c.capacity, COUNT(e.id)::int AS current_enrollment
       FROM academic.classes c
       LEFT JOIN student.studentenrollments e 
         ON c.section_id = e.section_id AND c.academic_year_id = e.academic_year_id
       WHERE c.section_id = $1 AND c.academic_year_id = $2 AND c.school_id = $3
       GROUP BY c.capacity`,
      [section_id, academic_year_id, schoolId]
    );
    if (!cap.rows[0]) throw new AppError('Class not activated for this academic year.', 400, ERROR_CODES.NOT_FOUND);
    if (cap.rows[0].current_enrollment >= cap.rows[0].capacity) {
      throw new AppError(`Classroom full: capacity of ${cap.rows[0].capacity} reached.`, 400, ERROR_CODES.CAPACITY_EXCEEDED);
    }

    const hashedPw = await hashPassword(password || 'Student123!');
    const userRes = await client.query(
      `INSERT INTO identity.users (email, password_hash, school_id, first_name, last_name, status)
       VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
      [email, hashedPw, schoolId, first_name, last_name]
    );
    const userId = userRes.rows[0].id;
    await client.query(
      `INSERT INTO identity.userroles (user_id, role_id)
       SELECT $1, id FROM identity.roles WHERE name = 'STUDENT' LIMIT 1`,
      [userId]
    );

    const resolvedClassId = await resolveClassId(client, schoolId, section_id, academic_year_id, class_id);

    const studentRes = await client.query(
      `INSERT INTO student.students (
         school_id, user_id, admission_number, student_id_number, first_name, middle_name, last_name,
         first_name_local, last_name_local, gender, date_of_birth, phone, address, home_address,
         city, region, nationality, religion, photo_url, enrollment_date,
         emergency_contact_name, emergency_contact_phone, lifecycle_status, created_by
       ) VALUES (
         $1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'active',$22
       ) RETURNING id`,
      [
        schoolId, userId, admission_number, first_name, middle_name || null, last_name,
        first_name_local || null, last_name_local || null, gender || null, date_of_birth || null,
        phone || null, address || null, home_address || null, city || null, region || null,
        nationality || 'Ethiopian', religion || null, photo_url || null, enrollment_date || null,
        emergency_contact_name || null, emergency_contact_phone || null, actorId,
      ]
    );
    const studentId = studentRes.rows[0].id;

    const enrollRes = await client.query(
      `INSERT INTO student.studentenrollments (
         school_id, student_id, section_id, academic_year_id, class_id, roll_number, enrolled_by, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active') RETURNING id`,
      [schoolId, studentId, section_id, academic_year_id, resolvedClassId, roll_number || null, actorId]
    );

    if (guardians?.length) {
      for (const g of guardians) {
        await insertGuardianLink(client, schoolId, studentId, g);
      }
    }

    await upsertMedicalInTx(client, schoolId, studentId, medical, actorId);

    await client.query('COMMIT');
    audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.ENROLL, entity: 'student', entityId: studentId });
    logStudentActivity({ schoolId, studentId, actorId, action: 'ENROLLED', meta: { section_id, academic_year_id } });

    return {
      student_id: studentId,
      user_id: userId,
      enrollment_id: enrollRes.rows[0].id,
      seats_remaining: cap.rows[0].capacity - cap.rows[0].current_enrollment - 1,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') throw new AppError('Email or admission number already exists.', 409, ERROR_CODES.DUPLICATE_ENTRY);
    throw err;
  } finally {
    client.release();
  }
};

export const updateStudent = async (schoolId, studentId, data, actorId) => {
  const allowed = [
    'first_name', 'middle_name', 'last_name', 'first_name_local', 'last_name_local',
    'gender', 'date_of_birth', 'admission_number', 'student_id_number',
    'phone', 'address', 'home_address', 'city', 'region', 'nationality', 'religion', 'photo_url',
    'enrollment_date', 'withdrawal_date', 'withdrawal_reason',
    'blood_group', 'emergency_contact_name', 'emergency_contact_phone', 'lifecycle_status',
  ];
  const fields = [];
  const params = [];
  let idx = 1;
  for (const key of allowed) {
    if (data[key] !== undefined) {
      if (key === 'student_id_number') {
        fields.push(`student_id_number = $${idx++}`, `admission_number = $${idx++}`);
        params.push(data[key], data[key]);
      } else {
        fields.push(`${key} = $${idx++}`);
        params.push(data[key]);
      }
    }
  }
  if (data.withdrawal_date) {
    fields.push(`lifecycle_status = $${idx++}`);
    params.push('suspended');
  }
  if (!fields.length) throw new AppError('No valid fields to update.', 400, ERROR_CODES.VALIDATION_ERROR);

  params.push(schoolId, studentId);
  const result = await query(
    `UPDATE student.students SET ${fields.join(', ')}, updated_at = NOW()
     WHERE school_id = $${idx++} AND id = $${idx} AND deleted_at IS NULL RETURNING id`,
    params
  );
  if (!result.rows[0]) throw new AppError('Student not found.', 404, ERROR_CODES.NOT_FOUND);

  audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.UPDATE, entity: 'student', entityId: studentId });
  logStudentActivity({ schoolId, studentId, actorId, action: 'UPDATED', meta: data });
  return result.rows[0];
};

export const archiveStudent = async (schoolId, studentId, actorId) => {
  const result = await query(
    `UPDATE student.students SET lifecycle_status = 'archived', archived_at = NOW(), updated_at = NOW()
     WHERE school_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING id`,
    [schoolId, studentId]
  );
  if (!result.rows[0]) throw new AppError('Student not found.', 404, ERROR_CODES.NOT_FOUND);
  audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.UPDATE, entity: 'student', entityId: studentId, meta: { lifecycle: 'archived' } });
  logStudentActivity({ schoolId, studentId, actorId, action: 'ARCHIVED' });
  return result.rows[0];
};

export const restoreStudent = async (schoolId, studentId, actorId) => {
  const result = await query(
    `UPDATE student.students SET lifecycle_status = 'active', archived_at = NULL, updated_at = NOW()
     WHERE school_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING id`,
    [schoolId, studentId]
  );
  if (!result.rows[0]) throw new AppError('Student not found.', 404, ERROR_CODES.NOT_FOUND);
  audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.UPDATE, entity: 'student', entityId: studentId, meta: { lifecycle: 'active' } });
  logStudentActivity({ schoolId, studentId, actorId, action: 'RESTORED' });
  return result.rows[0];
};

export const softDeleteStudent = async (schoolId, studentId, actorId) => {
  const result = await query(
    `UPDATE student.students SET deleted_at = NOW(), lifecycle_status = 'deleted', updated_at = NOW()
     WHERE school_id = $1 AND id = $2 RETURNING id`,
    [schoolId, studentId]
  );
  if (!result.rows[0]) throw new AppError('Student not found.', 404, ERROR_CODES.NOT_FOUND);
  logStudentActivity({ schoolId, studentId, actorId, action: 'SOFT_DELETED' });
  return result.rows[0];
};

export const bulkStudentAction = async (schoolId, { ids, action }, actorId) => {
  if (!ids?.length) throw new AppError('No students selected.', 400, ERROR_CODES.VALIDATION_ERROR);

  const map = {
    archive: `lifecycle_status = 'archived', archived_at = NOW()`,
    restore: `lifecycle_status = 'active', archived_at = NULL`,
    activate: `lifecycle_status = 'active'`,
    suspend: `lifecycle_status = 'suspended'`,
  };
  const setClause = map[action];
  if (!setClause) throw new AppError('Invalid bulk action.', 400, ERROR_CODES.VALIDATION_ERROR);

  await query(
    `UPDATE student.students SET ${setClause}, updated_at = NOW()
     WHERE school_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL`,
    [schoolId, ids]
  );
  for (const id of ids) {
    audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.UPDATE, entity: 'student', entityId: id, meta: { bulk: action } });
    logStudentActivity({ schoolId, studentId: id, actorId, action: `BULK_${action.toUpperCase()}` });
  }
  return { updated: ids.length };
};

export const addStudentNote = async (schoolId, studentId, { body, is_pinned }, actorId) => {
  const result = await query(
    `INSERT INTO student.student_notes (school_id, student_id, author_id, body, is_pinned)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [schoolId, studentId, actorId, body, is_pinned || false]
  );
  logStudentActivity({ schoolId, studentId, actorId, action: 'NOTE_ADDED' });
  return result.rows[0];
};

export const addStudentGuardian = async (schoolId, studentId, data, actorId) => {
  const check = await query(
    `SELECT id FROM student.students WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL`,
    [studentId, schoolId]
  );
  if (!check.rows[0]) throw new AppError('Student not found.', 404, ERROR_CODES.NOT_FOUND);

  const client = await getClient();
  try {
    await client.query('BEGIN');
    await insertGuardianLink(client, schoolId, studentId, data);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const result = await query(
    `SELECT g.id, g.first_name, g.last_name,
            trim(g.first_name || ' ' || g.last_name) AS full_name,
            g.relationship, g.phone_primary AS phone, g.email, gl.is_primary
     FROM student.guardian_links gl
     JOIN student.guardians g ON g.id = gl.guardian_id
     WHERE gl.student_id = $1 ORDER BY g.created_at DESC LIMIT 1`,
    [studentId]
  );
  audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.CREATE, entity: 'student_guardian', entityId: result.rows[0]?.id });
  logStudentActivity({ schoolId, studentId, actorId, action: 'GUARDIAN_ADDED' });
  return result.rows[0];
};

export const updateStudentGuardian = async (schoolId, studentId, guardianId, data, actorId) => {
  const link = await query(
    `SELECT 1 FROM student.guardian_links WHERE student_id = $1 AND guardian_id = $2`,
    [studentId, guardianId]
  );
  if (!link.rows[0]) throw new AppError('Guardian not found.', 404, ERROR_CODES.NOT_FOUND);

  const names = data.full_name ? parseGuardianName(data) : null;
  await query(
    `UPDATE student.guardians SET
       first_name = COALESCE($4, first_name),
       last_name = COALESCE($5, last_name),
       relationship = COALESCE($6, relationship),
       email = COALESCE($7, email),
       phone_primary = COALESCE($8, phone_primary),
       phone_secondary = COALESCE($9, phone_secondary),
       occupation = COALESCE($10, occupation),
       updated_at = NOW()
     WHERE id = $1 AND school_id = $2`,
    [
      guardianId,
      schoolId,
      names?.first_name,
      names?.last_name,
      data.relationship,
      data.email,
      data.phone || data.phone_primary,
      data.phone_secondary,
      data.occupation,
    ]
  );

  if (data.is_primary !== undefined || data.is_emergency !== undefined || data.can_pickup !== undefined) {
    await query(
      `UPDATE student.guardian_links SET
         is_primary = COALESCE($3, is_primary),
         is_emergency = COALESCE($4, is_emergency),
         can_pickup = COALESCE($5, can_pickup)
       WHERE student_id = $1 AND guardian_id = $2`,
      [studentId, guardianId, data.is_primary, data.is_emergency, data.can_pickup]
    );
  }

  const result = await query(
    `SELECT g.id, trim(g.first_name || ' ' || g.last_name) AS full_name, g.relationship, g.phone_primary AS phone, g.email, gl.is_primary
     FROM student.guardians g
     JOIN student.guardian_links gl ON gl.guardian_id = g.id AND gl.student_id = $2
     WHERE g.id = $1`,
    [guardianId, studentId]
  );
  audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.UPDATE, entity: 'student_guardian', entityId: guardianId });
  logStudentActivity({ schoolId, studentId, actorId, action: 'GUARDIAN_UPDATED', meta: { guardianId } });
  return result.rows[0];
};

export const deleteStudentGuardian = async (schoolId, studentId, guardianId, actorId) => {
  const result = await query(
    `DELETE FROM student.guardian_links WHERE student_id = $1 AND guardian_id = $2 RETURNING guardian_id`,
    [studentId, guardianId]
  );
  if (!result.rows[0]) throw new AppError('Guardian not found.', 404, ERROR_CODES.NOT_FOUND);
  await query(
    `UPDATE student.guardians SET is_deleted = true, updated_at = NOW()
     WHERE id = $1 AND school_id = $2
       AND NOT EXISTS (SELECT 1 FROM student.guardian_links WHERE guardian_id = $1)`,
    [guardianId, schoolId]
  );
  audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.DELETE, entity: 'student_guardian', entityId: guardianId });
  logStudentActivity({ schoolId, studentId, actorId, action: 'GUARDIAN_REMOVED', meta: { guardianId } });
  return { deleted: true };
};

export const importStudents = async (schoolId, rows, actorId) => {
  if (!rows?.length) throw new AppError('No rows to import.', 400, ERROR_CODES.VALIDATION_ERROR);

  const results = { imported: 0, failed: [] };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      await registerAndEnrollStudent(
        {
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
          admission_number: row.admission_number,
          academic_year_id: row.academic_year_id,
          section_id: row.section_id,
          grade_id: row.grade_id,
          gender: row.gender,
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

export const listSchoolTags = async (schoolId) => {
  const result = await query(
    `SELECT id, name, color FROM student.student_tags WHERE school_id = $1 ORDER BY name`,
    [schoolId]
  ).catch(() => ({ rows: [] }));
  return result.rows;
};

export const createSchoolTag = async (schoolId, { name, color }, actorId) => {
  const result = await query(
    `INSERT INTO student.student_tags (school_id, name, color)
     VALUES ($1, $2, $3)
     ON CONFLICT (school_id, name) DO UPDATE SET color = EXCLUDED.color
     RETURNING *`,
    [schoolId, name, color || '#059669']
  );
  return result.rows[0];
};

export const assignStudentTag = async (schoolId, studentId, tagId, actorId) => {
  await query(
    `SELECT id FROM student.students WHERE id = $1 AND school_id = $2`,
    [studentId, schoolId]
  ).then((r) => {
    if (!r.rows[0]) throw new AppError('Student not found.', 404, ERROR_CODES.NOT_FOUND);
  });
  await query(
    `INSERT INTO student.student_tag_map (student_id, tag_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [studentId, tagId]
  );
  logStudentActivity({ schoolId, studentId, actorId, action: 'TAG_ASSIGNED', meta: { tagId } });
  return { student_id: studentId, tag_id: tagId };
};

export const removeStudentTag = async (schoolId, studentId, tagId, actorId) => {
  await query(
    `DELETE FROM student.student_tag_map WHERE student_id = $1 AND tag_id = $2`,
    [studentId, tagId]
  );
  logStudentActivity({ schoolId, studentId, actorId, action: 'TAG_REMOVED', meta: { tagId } });
  return { removed: true };
};

export const addStudentDocument = async (schoolId, studentId, data, actorId) => {
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
    `INSERT INTO student.student_documents (school_id, student_id, title, file_url, doc_type, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [schoolId, studentId, title.trim(), url, doc_type || 'general', actorId]
  ).catch((err) => {
    if (err.code === '42P01') throw new AppError('Documents table not migrated. Run latest DB migration.', 500);
    throw err;
  });
  logStudentActivity({ schoolId, studentId, actorId, action: 'DOCUMENT_ADDED', meta: { title } });
  return result.rows[0];
};

export const exportStudentsCsv = async (schoolId, queryParams) => {
  const { rows } = await listStudents(schoolId, { ...queryParams, page: 1, limit: 10000 });
  const header = 'admission_number,first_name,last_name,email,gender,grade,section,status,academic_year\n';
  const lines = rows.map((r) =>
    [r.admission_number, r.first_name, r.last_name, r.email, r.gender, r.grade_name, r.section_name,
      r.lifecycle_status || r.account_status, r.academic_year]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
  );
  return header + lines.join('\n');
};
