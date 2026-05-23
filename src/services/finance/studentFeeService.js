import { query, getClient } from '../../config/db.js';
import { AppError } from '../../utils/errors.js';

/** Whether a category's frequency belongs on a term-style invoice for the given term number */
export function frequencyAppliesToTermInvoice(frequency, term) {
  const t = term != null && term !== '' ? Number(term) : null;
  switch (frequency) {
    case 'annual':
      return t === null || t === 1;
    case 'monthly':
      return false;
    case 'one_time':
      return true;
    case 'term':
    default:
      return true;
  }
}

async function pickScheduleAmount(client, schoolId, feeCategoryId, academicYear, term, gradeId, defaultAmount) {
  const sch = await client.query(
    `SELECT fs.id, fs.amount
     FROM finance.fee_schedules fs
     WHERE fs.school_id = $1 AND fs.fee_category_id = $2 AND fs.academic_year = $3
       AND ($4::smallint IS NULL OR fs.term IS NULL OR fs.term = $4)
       AND (fs.grade_id IS NULL OR fs.grade_id = $5)
     ORDER BY CASE WHEN fs.grade_id = $5 THEN 0 WHEN fs.grade_id IS NULL THEN 1 ELSE 2 END,
              fs.term NULLS FIRST
     LIMIT 1`,
    [schoolId, feeCategoryId, academicYear, term ?? null, gradeId]
  );
  if (sch.rows[0]) {
    return { amount: Number(sch.rows[0].amount), fee_schedule_id: sch.rows[0].id };
  }
  const fallback = Number(defaultAmount || 0);
  return { amount: fallback, fee_schedule_id: null };
}

/** List fee categories with subscription stats */
export const listCategoriesEnriched = async (schoolId) => {
  const res = await query(
    `SELECT fc.*,
            (SELECT COUNT(*)::int FROM finance.student_fee_assignments a
             WHERE a.fee_category_id = fc.id AND a.school_id = fc.school_id AND a.is_active = true) AS active_subscribers
     FROM finance.fee_categories fc
     WHERE fc.school_id = $1 AND fc.is_active = true
     ORDER BY fc.category_type DESC, fc.name`,
    [schoolId]
  );
  return res.rows;
};

export const createCategory = async (schoolId, data) => {
  const res = await query(
    `INSERT INTO finance.fee_categories (
       school_id, name, code, is_mandatory, frequency, category_type, description, default_amount
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      schoolId,
      data.name,
      data.code || null,
      data.is_mandatory ?? data.category_type === 'mandatory',
      data.frequency || 'term',
      data.category_type || (data.is_mandatory ? 'mandatory' : 'optional'),
      data.description || null,
      data.default_amount ?? null,
    ]
  );
  return res.rows[0];
};

export const listStudentAssignments = async (schoolId, studentId, academicYear) => {
  const res = await query(
    `SELECT a.*, fc.name AS category_name, fc.code, fc.frequency AS category_frequency,
            fc.category_type, fc.is_mandatory, fc.default_amount
     FROM finance.student_fee_assignments a
     JOIN finance.fee_categories fc ON fc.id = a.fee_category_id
     WHERE a.school_id = $1 AND a.student_id = $2
       AND ($3::varchar IS NULL OR a.academic_year = $3)
     ORDER BY fc.category_type DESC, fc.name`,
    [schoolId, studentId, academicYear || null]
  );
  return res.rows;
};

export const listSubscriptionMatrix = async (schoolId, { academicYear, gradeId, sectionId, search } = {}) => {
  const params = [schoolId, academicYear];
  let sql = `
    SELECT s.id AS student_id, s.first_name, s.last_name, s.student_id_number,
           g.id AS grade_id, g.name AS grade_name, sec.name AS section_name,
           COALESCE(
             json_agg(
               json_build_object(
                 'assignment_id', a.id,
                 'fee_category_id', fc.id,
                 'category_name', fc.name,
                 'category_type', fc.category_type,
                 'frequency', COALESCE(a.frequency, fc.frequency),
                 'custom_amount', a.custom_amount,
                 'is_active', a.is_active
               ) ORDER BY fc.name
             ) FILTER (WHERE a.id IS NOT NULL),
             '[]'::json
           ) AS subscriptions
    FROM student.students s
    JOIN student.studentenrollments se ON se.student_id = s.id AND se.school_id = s.school_id AND se.status = 'active'
    JOIN academic.sections sec ON sec.id = se.section_id
    JOIN academic.grades g ON g.id = sec.grade_id
    LEFT JOIN finance.student_fee_assignments a
      ON a.student_id = s.id AND a.school_id = s.school_id
      AND a.academic_year = $2 AND a.is_active = true
    LEFT JOIN finance.fee_categories fc ON fc.id = a.fee_category_id AND fc.is_active = true
    WHERE s.school_id = $1 AND s.deleted_at IS NULL`;

  if (gradeId) {
    params.push(gradeId);
    sql += ` AND g.id = $${params.length}`;
  }
  if (sectionId) {
    params.push(sectionId);
    sql += ` AND sec.id = $${params.length}`;
  }
  if (search) {
    params.push(`%${search}%`);
    sql += ` AND (s.first_name ILIKE $${params.length} OR s.last_name ILIKE $${params.length} OR s.student_id_number ILIKE $${params.length})`;
  }

  sql += ` GROUP BY s.id, g.id, g.name, sec.name ORDER BY g.name, sec.name, s.last_name, s.first_name`;
  const res = await query(sql, params);
  return res.rows;
};

export const setStudentSubscriptions = async (schoolId, studentId, academicYear, categories, actorId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE finance.student_fee_assignments
       SET is_active = false, updated_at = now()
       WHERE school_id = $1 AND student_id = $2 AND academic_year = $3`,
      [schoolId, studentId, academicYear]
    );

    for (const c of categories) {
      if (!c.fee_category_id) continue;
      await client.query(
        `INSERT INTO finance.student_fee_assignments (
           school_id, student_id, fee_category_id, academic_year,
           custom_amount, frequency, is_active, notes, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8)
         ON CONFLICT (school_id, student_id, fee_category_id, academic_year)
         DO UPDATE SET
           custom_amount = EXCLUDED.custom_amount,
           frequency = EXCLUDED.frequency,
           is_active = true,
           notes = EXCLUDED.notes,
           updated_at = now()`,
        [
          schoolId,
          studentId,
          c.fee_category_id,
          academicYear,
          c.custom_amount ?? null,
          c.frequency || null,
          c.notes || null,
          actorId,
        ]
      );
    }
    await client.query('COMMIT');
    return listStudentAssignments(schoolId, studentId, academicYear);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

export const syncMandatorySubscriptions = async (schoolId, academicYear, actorId) => {
  const mandatory = await query(
    `SELECT id, frequency FROM finance.fee_categories
     WHERE school_id = $1 AND is_active = true
       AND (category_type = 'mandatory' OR is_mandatory = true)`,
    [schoolId]
  );
  if (!mandatory.rows.length) {
    throw new AppError('No mandatory fee categories defined.', 400);
  }

  const students = await query(
    `SELECT DISTINCT s.id AS student_id
     FROM student.students s
     JOIN student.studentenrollments se ON se.student_id = s.id AND se.status = 'active'
     WHERE s.school_id = $1 AND s.deleted_at IS NULL`,
    [schoolId]
  );

  let count = 0;
  for (const st of students.rows) {
    for (const cat of mandatory.rows) {
      await query(
        `INSERT INTO finance.student_fee_assignments (
           school_id, student_id, fee_category_id, academic_year, frequency, is_active, created_by
         ) VALUES ($1, $2, $3, $4, $5, true, $6)
         ON CONFLICT (school_id, student_id, fee_category_id, academic_year)
         DO UPDATE SET is_active = true, frequency = EXCLUDED.frequency, updated_at = now()`,
        [schoolId, st.student_id, cat.id, academicYear, cat.frequency, actorId]
      );
      count += 1;
    }
  }
  return { students: students.rows.length, assignments: count };
};

/**
 * Billable lines for one student for a term invoice.
 * Priority: active subscriptions → mandatory categories with schedules/default amounts.
 */
export const resolveBillableLinesForStudent = async (client, schoolId, student, input) => {
  const assignments = await client.query(
    `SELECT a.*, fc.name AS category_name, fc.frequency AS category_frequency,
            fc.category_type, fc.default_amount
     FROM finance.student_fee_assignments a
     JOIN finance.fee_categories fc ON fc.id = a.fee_category_id AND fc.is_active = true
     WHERE a.school_id = $1 AND a.student_id = $2 AND a.academic_year = $3 AND a.is_active = true`,
    [schoolId, student.student_id, input.academic_year]
  );

  const lineItems = [];
  const seenCategories = new Set();

  const pushLine = (line) => {
    if (seenCategories.has(line.fee_category_id)) return;
    if (!line.amount || Number(line.amount) <= 0) return;
    seenCategories.add(line.fee_category_id);
    lineItems.push(line);
  };

  if (assignments.rows.length > 0) {
    for (const a of assignments.rows) {
      const freq = a.frequency || a.category_frequency;
      if (!frequencyAppliesToTermInvoice(freq, input.term)) continue;

      if (a.custom_amount != null && Number(a.custom_amount) > 0) {
        pushLine({
          category_name: a.category_name,
          amount: Number(a.custom_amount),
          fee_category_id: a.fee_category_id,
          fee_schedule_id: null,
          frequency: freq,
        });
        continue;
      }

      const { amount, fee_schedule_id } = await pickScheduleAmount(
        client,
        schoolId,
        a.fee_category_id,
        input.academic_year,
        input.term ?? null,
        student.grade_id,
        a.default_amount
      );
      pushLine({
        category_name: a.category_name,
        amount,
        fee_category_id: a.fee_category_id,
        fee_schedule_id,
        frequency: freq,
      });
    }
    return lineItems;
  }

  const mandatoryCats = await client.query(
    `SELECT id, name, frequency, default_amount
     FROM finance.fee_categories
     WHERE school_id = $1 AND is_active = true
       AND (category_type = 'mandatory' OR is_mandatory = true)`,
    [schoolId]
  );

  for (const cat of mandatoryCats.rows) {
    if (!frequencyAppliesToTermInvoice(cat.frequency, input.term)) continue;
    const { amount, fee_schedule_id } = await pickScheduleAmount(
      client,
      schoolId,
      cat.id,
      input.academic_year,
      input.term ?? null,
      student.grade_id,
      cat.default_amount
    );
    pushLine({
      category_name: cat.name,
      amount,
      fee_category_id: cat.id,
      fee_schedule_id,
      frequency: cat.frequency,
    });
  }

  return lineItems;
};
