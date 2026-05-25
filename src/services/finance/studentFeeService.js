import { query, getClient } from '../../config/db.js';
import { AppError } from '../../utils/errors.js';

/** Whether a category's frequency belongs on a term-style invoice for the given term number */
export function frequencyAppliesToTermInvoice(frequency, term, { includeMonthly = false } = {}) {
  const t = term != null && term !== '' ? Number(term) : null;
  switch (frequency) {
    case 'annual':
      return t === null || t === 1;
    case 'monthly':
      return includeMonthly && (t === null || t === 1);
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

const resolveCategoryLine = async (client, schoolId, student, input, cat) => {
  const freq = cat.frequency || cat.category_frequency;
  if (!frequencyAppliesToTermInvoice(freq, input.term, { includeMonthly: !!input.include_monthly })) {
    return { skip: true, reason: freq === 'monthly' ? 'monthly_not_on_term' : 'frequency_not_applicable' };
  }
  if (cat.custom_amount != null && Number(cat.custom_amount) > 0) {
    return {
      skip: false,
      line: {
        category_name: cat.category_name || cat.name,
        amount: Number(cat.custom_amount),
        fee_category_id: cat.fee_category_id || cat.id,
        fee_schedule_id: null,
        frequency: freq,
      },
    };
  }
  const { amount, fee_schedule_id } = await pickScheduleAmount(
    client,
    schoolId,
    cat.fee_category_id || cat.id,
    input.academic_year,
    input.term ?? null,
    student.grade_id,
    cat.default_amount
  );
  if (!amount || Number(amount) <= 0) {
    return { skip: true, reason: 'no_price' };
  }
  return {
    skip: false,
    line: {
      category_name: cat.category_name || cat.name,
      amount,
      fee_category_id: cat.fee_category_id || cat.id,
      fee_schedule_id,
      frequency: freq,
    },
  };
};

/**
 * Billable lines for one student for a term invoice.
 * Subscriptions first, then mandatory categories fill gaps (fixes sync-without-schedule skips).
 */
export const resolveBillableLinesForStudent = async (client, schoolId, student, input) => {
  const lineItems = [];
  const seenCategories = new Set();

  const pushLine = (line) => {
    if (seenCategories.has(line.fee_category_id)) return;
    if (!line.amount || Number(line.amount) <= 0) return;
    seenCategories.add(line.fee_category_id);
    lineItems.push(line);
  };

  const assignments = await client.query(
    `SELECT a.*, fc.name AS category_name, fc.frequency AS category_frequency,
            fc.category_type, fc.default_amount
     FROM finance.student_fee_assignments a
     JOIN finance.fee_categories fc ON fc.id = a.fee_category_id AND fc.is_active = true
     WHERE a.school_id = $1 AND a.student_id = $2 AND a.academic_year = $3 AND a.is_active = true`,
    [schoolId, student.student_id, input.academic_year]
  );

  for (const a of assignments.rows) {
    const { skip, line } = await resolveCategoryLine(client, schoolId, student, input, {
      ...a,
      fee_category_id: a.fee_category_id,
      frequency: a.frequency || a.category_frequency,
    });
    if (!skip && line) pushLine(line);
  }

  const mandatoryCats = await client.query(
    `SELECT id, name, frequency, default_amount
     FROM finance.fee_categories
     WHERE school_id = $1 AND is_active = true
       AND (category_type = 'mandatory' OR is_mandatory = true)`,
    [schoolId]
  );

  for (const cat of mandatoryCats.rows) {
    if (seenCategories.has(cat.id)) continue;
    const { skip, line } = await resolveCategoryLine(client, schoolId, student, input, cat);
    if (!skip && line) pushLine(line);
  }

  return lineItems;
};

export const diagnoseStudentBilling = async (client, schoolId, student, input) => {
  const lines = await resolveBillableLinesForStudent(client, schoolId, student, input);
  const total = lines.reduce((s, l) => s + Number(l.amount), 0);
  if (lines.length && total > 0) {
    return { billable: true, total, line_count: lines.length, lines };
  }

  const subs = await client.query(
    `SELECT fc.name, COALESCE(a.frequency, fc.frequency) AS freq
     FROM finance.student_fee_assignments a
     JOIN finance.fee_categories fc ON fc.id = a.fee_category_id
     WHERE a.school_id = $1 AND a.student_id = $2 AND a.academic_year = $3 AND a.is_active = true`,
    [schoolId, student.student_id, input.academic_year]
  );
  if (!subs.rows.length) return { billable: false, reason: 'no_subscriptions' };

  const monthlyOnly = subs.rows.every(
    (r) => !frequencyAppliesToTermInvoice(r.freq, input.term, { includeMonthly: !!input.include_monthly })
  );
  if (monthlyOnly) return { billable: false, reason: 'monthly_not_on_term' };

  return { billable: false, reason: 'no_priced_lines' };
};

/** Fix Tuition (and mandatory) categories to term frequency so term invoices work */
export const repairTermBillingCategories = async (schoolId) => {
  const res = await query(
    `UPDATE finance.fee_categories
     SET frequency = 'term',
         is_mandatory = true,
         category_type = 'mandatory'
     WHERE school_id = $1 AND is_active = true
       AND (LOWER(name) = 'tuition' OR (category_type = 'mandatory' OR is_mandatory = true))
       AND frequency = 'monthly'
     RETURNING id, name`,
    [schoolId]
  );
  await query(
    `UPDATE finance.student_fee_assignments a
     SET frequency = fc.frequency
     FROM finance.fee_categories fc
     WHERE a.fee_category_id = fc.id AND a.school_id = $1`,
    [schoolId]
  );
  return { updated: res.rows };
};

export const previewTermInvoices = async (schoolId, input) => {
  const client = await getClient();
  try {
    const roster = await client.query(
      `SELECT DISTINCT s.id AS student_id, g.id AS grade_id, g.name AS grade_name,
              s.first_name, s.last_name, s.admission_number
       FROM student.studentenrollments se
       JOIN student.students s ON s.id = se.student_id AND s.school_id = se.school_id
       JOIN academic.sections sec ON sec.id = se.section_id
       JOIN academic.grades g ON g.id = sec.grade_id
       WHERE se.school_id = $1 AND se.status = 'active' AND s.deleted_at IS NULL
         AND ($2::uuid IS NULL OR g.id = $2)`,
      [schoolId, input.grade_id || null]
    );

    let billable = 0;
    let skipped = 0;
    let projectedTotal = 0;
    const skipReasons = {};
    const samples = [];

    for (const student of roster.rows) {
      const diag = await diagnoseStudentBilling(client, schoolId, student, input);
      if (diag.billable) {
        billable += 1;
        projectedTotal += diag.total;
        if (samples.length < 5) {
          samples.push({
            student_id: student.student_id,
            name: `${student.first_name} ${student.last_name}`,
            admission_number: student.admission_number,
            grade_name: student.grade_name,
            total: diag.total,
            line_count: diag.line_count,
          });
        }
      } else {
        skipped += 1;
        const r = diag.reason || 'unknown';
        skipReasons[r] = (skipReasons[r] || 0) + 1;
      }
    }

    const setup = await getBillingSetupStatus(schoolId, input.academic_year);

    return {
      roster: roster.rows.length,
      billable,
      skipped,
      projected_total: Math.round(projectedTotal * 100) / 100,
      skip_reasons: skipReasons,
      samples,
      setup,
      ready: billable > 0 && setup.has_categories && setup.has_schedules,
      warnings: setup.warnings || [],
    };
  } finally {
    client.release();
  }
};

export const getBillingSetupStatus = async (schoolId, academicYear) => {
  const [cats, sched, subs, mandatory, monthlyCats] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS n FROM finance.fee_categories WHERE school_id = $1 AND is_active = true`,
      [schoolId]
    ),
    query(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(amount), 0)::numeric(12,2) AS total_amount
       FROM finance.fee_schedules WHERE school_id = $1 AND academic_year = $2`,
      [schoolId, academicYear]
    ),
    query(
      `SELECT COUNT(DISTINCT student_id)::int AS students
       FROM finance.student_fee_assignments
       WHERE school_id = $1 AND academic_year = $2 AND is_active = true`,
      [schoolId, academicYear]
    ),
    query(
      `SELECT COUNT(*)::int AS n FROM finance.fee_categories
       WHERE school_id = $1 AND is_active = true AND (category_type = 'mandatory' OR is_mandatory = true)`,
      [schoolId]
    ),
    query(
      `SELECT id, name FROM finance.fee_categories
       WHERE school_id = $1 AND is_active = true AND frequency = 'monthly'
         AND (category_type = 'mandatory' OR is_mandatory = true OR LOWER(name) = 'tuition')`,
      [schoolId]
    ),
  ]);

  const warnings = [];
  if (monthlyCats.rows.length) {
    warnings.push({
      code: 'monthly_mandatory',
      message: `Mandatory fee "${monthlyCats.rows.map((r) => r.name).join(', ')}" uses monthly frequency — excluded from term invoices. Use "Fix term billing" or set frequency to Term.`,
    });
  }

  return {
    has_categories: (cats.rows[0]?.n || 0) > 0,
    category_count: cats.rows[0]?.n || 0,
    mandatory_count: mandatory.rows[0]?.n || 0,
    monthly_mandatory_count: monthlyCats.rows.length,
    has_schedules: (sched.rows[0]?.n || 0) > 0,
    schedule_count: sched.rows[0]?.n || 0,
    schedule_total_amount: Number(sched.rows[0]?.total_amount || 0),
    subscribed_students: subs.rows[0]?.students || 0,
    academic_year: academicYear,
    warnings,
  };
};

/** One-click demo/production bootstrap: categories, per-grade schedules, mandatory sync */
export const bootstrapSchoolFeeBilling = async (schoolId, academicYear, actorId, { term = 1 } = {}) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    let tuition = await client.query(
      `SELECT id FROM finance.fee_categories
       WHERE school_id = $1 AND LOWER(name) = 'tuition' LIMIT 1`,
      [schoolId]
    );
    if (!tuition.rows[0]) {
      const ins = await client.query(
        `INSERT INTO finance.fee_categories (
           school_id, name, code, is_mandatory, frequency, category_type, default_amount
         ) VALUES ($1, 'Tuition', 'TUIT', true, 'term', 'mandatory', 12000)
         RETURNING id`,
        [schoolId]
      );
      tuition = ins;
    }

    const categoryId = tuition.rows[0].id;
    const grades = await client.query(
      `SELECT id, name, level_order FROM academic.grades WHERE school_id = $1 ORDER BY level_order`,
      [schoolId]
    );

    let schedulesCreated = 0;
    const addSchedule = async (gradeId, amount) => {
      const res = await client.query(
        `INSERT INTO finance.fee_schedules (
           school_id, fee_category_id, grade_id, academic_year, term, amount
         ) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (school_id, fee_category_id, grade_id, academic_year, term) DO NOTHING
         RETURNING id`,
        [schoolId, categoryId, gradeId, academicYear, term, amount]
      );
      if (res.rows[0]) schedulesCreated += 1;
    };

    if (grades.rows.length === 0) {
      await addSchedule(null, 12000);
    } else {
      for (const g of grades.rows) {
        const base = 10000 + (Number(g.level_order) || 9) * 1000;
        await addSchedule(g.id, base);
      }
    }

    await client.query('COMMIT');

    await repairTermBillingCategories(schoolId);
    const sync = await syncMandatorySubscriptions(schoolId, academicYear, actorId);
    const setup = await getBillingSetupStatus(schoolId, academicYear);

    return {
      category_id: categoryId,
      schedules_created: schedulesCreated,
      grades: grades.rows.length,
      sync,
      setup,
      repaired_frequencies: true,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

/** Production roster: per-student term fees, invoice, and payment status */
export const listStudentBillingRoster = async (schoolId, input) => {
  const client = await getClient();
  const term = input.term != null && input.term !== '' ? Number(input.term) : null;
  try {
    const roster = await client.query(
      `SELECT DISTINCT s.id AS student_id, s.first_name, s.last_name, s.admission_number,
              g.id AS grade_id, g.name AS grade_name, sec.name AS section_name,
              inv.id AS invoice_id, inv.status AS invoice_status, inv.amount AS invoice_amount,
              inv.due_date,
              COALESCE(inv.total_paid, pt.paid, 0)::numeric(12,2) AS total_paid,
              GREATEST(inv.amount - COALESCE(inv.total_paid, pt.paid, 0), 0)::numeric(12,2) AS balance
       FROM student.studentenrollments se
       JOIN student.students s ON s.id = se.student_id AND s.school_id = se.school_id
       JOIN academic.sections sec ON sec.id = se.section_id
       JOIN academic.grades g ON g.id = sec.grade_id
       LEFT JOIN finance.invoices inv ON inv.student_id = s.id AND inv.school_id = s.school_id
         AND inv.academic_year = $2
         AND (($3::smallint IS NULL AND inv.term IS NULL) OR inv.term = $3)
         AND inv.fee_structure_id IS NULL
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(amount), 0)::numeric(12,2) AS paid
         FROM finance.payments p
         WHERE p.invoice_id = inv.id AND p.school_id = inv.school_id AND p.status = 'succeeded'
       ) pt ON true
       WHERE se.school_id = $1 AND se.status = 'active' AND s.deleted_at IS NULL
         AND ($4::uuid IS NULL OR g.id = $4)
       ORDER BY g.name, sec.name, s.last_name, s.first_name`,
      [schoolId, input.academic_year, term, input.grade_id || null]
    );

    let billable = 0;
    let projectedSchoolTotal = 0;
    let invoicedTotal = 0;
    let collectedTotal = 0;
    const students = [];

    for (const row of roster.rows) {
      const diag = await diagnoseStudentBilling(client, schoolId, {
        student_id: row.student_id,
        grade_id: row.grade_id,
      }, input);

      if (diag.billable) {
        billable += 1;
        projectedSchoolTotal += diag.total;
      }
      if (row.invoice_id) {
        invoicedTotal += Number(row.invoice_amount || 0);
        collectedTotal += Number(row.total_paid || 0);
      }

      students.push({
        student_id: row.student_id,
        first_name: row.first_name,
        last_name: row.last_name,
        admission_number: row.admission_number,
        grade_name: row.grade_name,
        section_name: row.section_name,
        projected_term_total: diag.billable ? diag.total : 0,
        billable: diag.billable,
        skip_reason: diag.billable ? null : diag.reason,
        fee_lines: diag.lines || [],
        invoice: row.invoice_id ? {
          id: row.invoice_id,
          status: row.invoice_status,
          amount: Number(row.invoice_amount),
          total_paid: Number(row.total_paid),
          balance: Number(row.balance),
          due_date: row.due_date,
        } : null,
        payment_status: row.invoice_id
          ? (row.invoice_status === 'paid' || Number(row.balance) <= 0 ? 'paid'
            : Number(row.total_paid) > 0 ? 'partial' : 'unpaid')
          : diag.billable ? 'not_invoiced' : 'not_billable',
      });
    }

    return {
      summary: {
        roster: students.length,
        billable,
        skipped: students.length - billable,
        projected_term_total: Math.round(projectedSchoolTotal * 100) / 100,
        invoiced_total: invoicedTotal,
        collected_total: collectedTotal,
        outstanding: Math.max(0, invoicedTotal - collectedTotal),
      },
      students,
    };
  } finally {
    client.release();
  }
};
