import { getClient, query } from '../../config/db.js';
import { AppError, ERROR_CODES } from '../../utils/errors.js';
import { auditLog } from '../../utils/audit.js';
import { resolveBillableLinesForStudent } from './studentFeeService.js';

const DEFAULT_COMMISSION_RATE = Number(process.env.PLATFORM_COMMISSION_RATE || 0.015);

export const getFinanceDashboard = async (schoolId) => {
  const [totals, recentTx, byMethod] = await Promise.all([
    query(
      `SELECT
         COALESCE(SUM(i.amount), 0)::numeric(12,2) AS billed,
         COALESCE(SUM(COALESCE(i.total_paid, pt.paid, 0)), 0)::numeric(12,2) AS collected,
         COUNT(*) FILTER (WHERE i.status IN ('pending', 'partial', 'unpaid'))::int AS open_invoices
       FROM finance.invoices i
       LEFT JOIN (
         SELECT invoice_id, SUM(amount)::numeric(12,2) AS paid
         FROM finance.payments WHERE school_id = $1 AND status = 'succeeded'
         GROUP BY invoice_id
       ) pt ON pt.invoice_id = i.id
       WHERE i.school_id = $1`,
      [schoolId]
    ),
    query(
      `SELECT id, type, method, amount, created_at, student_id
       FROM finance.financial_transactions
       WHERE school_id = $1
       ORDER BY created_at DESC LIMIT 15`,
      [schoolId]
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT method, COALESCE(SUM(amount), 0)::numeric(12,2) AS total
       FROM finance.financial_transactions
       WHERE school_id = $1 AND type = 'payment'
       GROUP BY method`,
      [schoolId]
    ).catch(() => ({ rows: [] })),
  ]);
  const row = totals.rows[0] || {};
  const billed = Number(row.billed || 0);
  const collected = Number(row.collected || 0);
  return {
    billed,
    collected,
    outstanding: Math.max(0, billed - collected),
    open_invoices: row.open_invoices ?? 0,
    recent_transactions: recentTx.rows,
    collections_by_method: byMethod.rows,
  };
};

export const listFeeCategories = async (schoolId) => {
  const res = await query(
    `SELECT * FROM finance.fee_categories WHERE school_id = $1 ORDER BY name`,
    [schoolId]
  );
  return res.rows;
};

export const createFeeCategory = async (schoolId, data) => {
  const categoryType = data.category_type || (data.is_mandatory ? 'mandatory' : 'optional');
  const res = await query(
    `INSERT INTO finance.fee_categories (
       school_id, name, code, is_mandatory, frequency, category_type, description, default_amount
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      schoolId,
      data.name,
      data.code || null,
      data.is_mandatory ?? categoryType === 'mandatory',
      data.frequency || 'term',
      categoryType,
      data.description || null,
      data.default_amount ?? null,
    ]
  );
  return res.rows[0];
};

export const listFeeSchedules = async (schoolId, { academicYear, gradeId } = {}) => {
  const params = [schoolId];
  let sql = `
    SELECT fs.*, fc.name AS category_name, g.name AS grade_name
    FROM finance.fee_schedules fs
    JOIN finance.fee_categories fc ON fc.id = fs.fee_category_id
    LEFT JOIN academic.grades g ON g.id = fs.grade_id
    WHERE fs.school_id = $1`;
  if (academicYear) {
    params.push(academicYear);
    sql += ` AND fs.academic_year = $${params.length}`;
  }
  if (gradeId) {
    params.push(gradeId);
    sql += ` AND fs.grade_id = $${params.length}`;
  }
  sql += ' ORDER BY fs.academic_year DESC, g.name, fc.name';
  const res = await query(sql, params);
  return res.rows;
};

export const createFeeSchedule = async (schoolId, data) => {
  const res = await query(
    `INSERT INTO finance.fee_schedules (
       school_id, fee_category_id, grade_id, academic_year, term, amount, currency
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      schoolId,
      data.fee_category_id,
      data.grade_id || null,
      data.academic_year,
      data.term ?? null,
      data.amount,
      data.currency || 'ETB',
    ]
  );
  return res.rows[0];
};

export const listDiscountRules = async (schoolId) => {
  const res = await query(
    `SELECT * FROM finance.discount_rules WHERE school_id = $1 ORDER BY name`,
    [schoolId]
  );
  return res.rows;
};

export const createDiscountRule = async (schoolId, data) => {
  const res = await query(
    `INSERT INTO finance.discount_rules (school_id, name, type, value, applies_to)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [schoolId, data.name, data.type, data.value, data.applies_to || 'all']
  );
  return res.rows[0];
};

export const listPaymentPlans = async (schoolId) => {
  const res = await query(
    `SELECT * FROM finance.payment_plans WHERE school_id = $1 ORDER BY name`,
    [schoolId]
  );
  return res.rows;
};

export const createPaymentPlan = async (schoolId, data) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    if (data.is_default) {
      await client.query(
        `UPDATE finance.payment_plans SET is_default = false WHERE school_id = $1`,
        [schoolId]
      );
    }
    const res = await client.query(
      `INSERT INTO finance.payment_plans (school_id, name, plan_type, installments, is_default)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [schoolId, data.name, data.plan_type || 'full', data.installments || 1, !!data.is_default]
    );
    await client.query('COMMIT');
    return res.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

/** Generate term invoices from per-student fee subscriptions + schedules */
export const generateTermInvoices = async (schoolId, userId, input) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const hasSetup = await client.query(
      `SELECT 1 FROM finance.fee_categories WHERE school_id = $1 AND is_active = true LIMIT 1`,
      [schoolId]
    );
    if (!hasSetup.rows[0]) {
      throw new AppError('Define fee categories before generating invoices.', 400);
    }

    const roster = await client.query(
      `SELECT DISTINCT s.id AS student_id, g.id AS grade_id
       FROM student.studentenrollments se
       JOIN student.students s ON s.id = se.student_id AND s.school_id = se.school_id
       JOIN academic.sections sec ON sec.id = se.section_id
       JOIN academic.grades g ON g.id = sec.grade_id
       WHERE se.school_id = $1 AND se.status = 'active' AND s.deleted_at IS NULL
         AND ($2::uuid IS NULL OR g.id = $2)`,
      [schoolId, input.grade_id || null]
    );

    let generated = 0;
    let skippedNoLines = 0;
    const dueDate = input.due_date || new Date().toISOString().slice(0, 10);

    for (const student of roster.rows) {
      const billLines = await resolveBillableLinesForStudent(client, schoolId, student, input);
      if (!billLines.length) {
        skippedNoLines += 1;
        continue;
      }

      let subtotal = 0;
      const lineItems = [];
      for (const li of billLines) {
        subtotal += Number(li.amount);
        lineItems.push({
          name: li.category_name,
          amount: li.amount,
          fee_category_id: li.fee_category_id,
          fee_schedule_id: li.fee_schedule_id,
        });
      }
      if (subtotal <= 0) continue;

      let discount = 0;
      if (input.discount_rule_id) {
        const dr = await client.query(
          `SELECT type, value FROM finance.discount_rules
           WHERE id = $1 AND school_id = $2 AND is_active = true`,
          [input.discount_rule_id, schoolId]
        );
        if (dr.rows[0]) {
          discount = dr.rows[0].type === 'percentage'
            ? subtotal * (Number(dr.rows[0].value) / 100)
            : Number(dr.rows[0].value);
        }
      }
      const totalDue = Math.max(0, subtotal - discount);

      const existing = await client.query(
        `SELECT id FROM finance.invoices
         WHERE school_id = $1 AND student_id = $2 AND academic_year = $3
           AND (($4::smallint IS NULL AND term IS NULL) OR term = $4)
           AND fee_structure_id IS NULL
         LIMIT 1`,
        [schoolId, student.student_id, input.academic_year, input.term ?? null]
      );

      let invoiceId;
      if (existing.rows[0]) {
        invoiceId = existing.rows[0].id;
        await client.query(
          `UPDATE finance.invoices
           SET amount = $1, subtotal = $2, discount_amount = $3, due_date = $4,
               payment_plan_id = $5, updated_at = now()
           WHERE id = $6`,
          [totalDue, subtotal, discount, dueDate, input.payment_plan_id || null, invoiceId]
        );
      } else {
        const inv = await client.query(
          `INSERT INTO finance.invoices (
             school_id, student_id, amount, subtotal, discount_amount, total_paid,
             academic_year, term, due_date, status, payment_plan_id, updated_at
           ) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, 'pending', $9, now())
           RETURNING id`,
          [
            schoolId,
            student.student_id,
            totalDue,
            subtotal,
            discount,
            input.academic_year,
            input.term ?? null,
            dueDate,
            input.payment_plan_id || null,
          ]
        );
        invoiceId = inv.rows[0].id;
      }

      await client.query(`DELETE FROM finance.invoiceitems WHERE invoice_id = $1`, [invoiceId]);
      for (const li of lineItems) {
        await client.query(
          `INSERT INTO finance.invoiceitems (
             school_id, invoice_id, name, amount, fee_category_id, fee_schedule_id
           ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [schoolId, invoiceId, li.name, li.amount, li.fee_category_id || null, li.fee_schedule_id || null]
        );
      }
      generated += 1;
    }

    await auditLog(client, {
      schoolId,
      userId,
      action: 'BULK_GENERATE_TERM',
      entityType: 'finance.invoices',
      entityId: null,
      meta: { academic_year: input.academic_year, term: input.term, generated },
    });

    await client.query('COMMIT');
    return {
      generated,
      students: roster.rows.length,
      skipped_no_lines: skippedNoLines,
      hint: skippedNoLines > 0
        ? 'Some students had no billable fees. Sync mandatory subscriptions, add schedules, or assign optional categories.'
        : null,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

export const listInvoicesDetailed = async (schoolId, { status, studentId, limit = 100 } = {}) => {
  const params = [schoolId];
  let sql = `
    WITH payment_totals AS (
      SELECT invoice_id, COALESCE(SUM(amount), 0)::numeric(12,2) AS paid_amount
      FROM finance.payments WHERE school_id = $1 AND status = 'succeeded'
      GROUP BY invoice_id
    )
    SELECT i.id, i.student_id, i.amount, i.subtotal, i.discount_amount,
           COALESCE(i.total_paid, pt.paid_amount, 0)::numeric(12,2) AS total_paid,
           (i.amount - COALESCE(i.total_paid, pt.paid_amount, 0))::numeric(12,2) AS balance,
           i.academic_year, i.term, i.due_date, i.status, i.created_at,
           s.first_name, s.last_name, s.admission_number,
           fs.name AS fee_structure_name
    FROM finance.invoices i
    JOIN student.students s ON s.id = i.student_id
    LEFT JOIN finance.feestructures fs ON fs.id = i.fee_structure_id
    LEFT JOIN payment_totals pt ON pt.invoice_id = i.id
    WHERE i.school_id = $1`;
  if (status) {
    params.push(status);
    sql += ` AND i.status = $${params.length}`;
  }
  if (studentId) {
    params.push(studentId);
    sql += ` AND i.student_id = $${params.length}`;
  }
  params.push(limit);
  sql += ` ORDER BY i.created_at DESC LIMIT $${params.length}`;
  const res = await query(sql, params);
  return res.rows;
};

export const insertLedgerAndSyncInvoice = async (client, {
  schoolId,
  invoiceId,
  studentId,
  paymentId,
  type,
  method,
  amount,
  recordedBy,
  chapaTxRef,
  idempotencyKey,
  notes,
}) => {
  if (chapaTxRef) {
    const dup = await client.query(
      `SELECT id FROM finance.financial_transactions WHERE chapa_tx_ref = $1`,
      [chapaTxRef]
    );
    if (dup.rows[0]) {
      const paidRes = await client.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric(12,2) AS paid
         FROM finance.payments WHERE school_id = $1 AND invoice_id = $2 AND status = 'succeeded'`,
        [schoolId, invoiceId]
      );
      return { ledgerId: dup.rows[0].id, invoiceStatus: 'paid', paid: Number(paidRes.rows[0].paid) };
    }
  }

  const ledger = await client.query(
    `INSERT INTO finance.financial_transactions (
       school_id, invoice_id, student_id, payment_id, type, method, amount,
       chapa_tx_ref, idempotency_key, recorded_by, notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      schoolId,
      invoiceId,
      studentId,
      paymentId,
      type,
      method,
      amount,
      chapaTxRef || null,
      idempotencyKey || null,
      recordedBy,
      notes || null,
    ]
  );

  const paidRes = await client.query(
    `SELECT COALESCE(SUM(amount), 0)::numeric(12,2) AS paid
     FROM finance.payments
     WHERE school_id = $1 AND invoice_id = $2 AND status = 'succeeded'`,
    [schoolId, invoiceId]
  );
  const paid = Number(paidRes.rows[0].paid);
  const inv = await client.query(
    `SELECT amount FROM finance.invoices WHERE id = $1 AND school_id = $2`,
    [invoiceId, schoolId]
  );
  const due = Number(inv.rows[0]?.amount || 0);
  const nextStatus = paid >= due ? 'paid' : paid > 0 ? 'partial' : 'pending';

  await client.query(
    `UPDATE finance.invoices
     SET status = $1, total_paid = $2, updated_at = now()
     WHERE id = $3 AND school_id = $4`,
    [nextStatus, paid, invoiceId, schoolId]
  );

  return { ledgerId: ledger.rows[0]?.id, invoiceStatus: nextStatus, paid };
};

export const recordCommission = async (client, { schoolId, sourceTxId, grossAmount }) => {
  const rate = DEFAULT_COMMISSION_RATE;
  const commission = Math.round(grossAmount * rate * 100) / 100;
  await client.query(
    `INSERT INTO finance.platform_commissions (
       school_id, source_tx_id, gross_amount, commission_rate, commission_etb
     ) VALUES ($1, $2, $3, $4, $5)`,
    [schoolId, sourceTxId, grossAmount, rate, commission]
  );
  return commission;
};

export const listLedger = async (schoolId, { studentId, limit = 50, offset = 0 } = {}) => {
  const params = [schoolId];
  let sql = `
    SELECT ft.*, s.first_name, s.last_name, s.admission_number
    FROM finance.financial_transactions ft
    LEFT JOIN student.students s ON s.id = ft.student_id
    WHERE ft.school_id = $1`;
  if (studentId) {
    params.push(studentId);
    sql += ` AND ft.student_id = $${params.length}`;
  }
  params.push(limit, offset);
  sql += ` ORDER BY ft.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
  const res = await query(sql, params);
  return res.rows;
};

export const settleChapaPayment = async ({ txRef, amount, status, invoiceId, metadata }) => {
  if (status !== 'success' && status !== 'successful') return { skipped: true, reason: 'not_success' };

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id FROM finance.financial_transactions WHERE chapa_tx_ref = $1`,
      [txRef]
    );
    if (existing.rows[0]) {
      await client.query(
        `UPDATE finance.chapa_payment_sessions
         SET status = 'success', completed_at = COALESCE(completed_at, now()), updated_at = now()
         WHERE tx_ref = $1 AND status = 'pending'`,
        [txRef]
      );
      await client.query('COMMIT');
      return { idempotent: true };
    }

    let invId = invoiceId || metadata?.invoice_id;
    if (!invId && txRef) {
      const sess = await client.query(
        `SELECT invoice_id FROM finance.chapa_payment_sessions WHERE tx_ref = $1`,
        [txRef]
      );
      invId = sess.rows[0]?.invoice_id;
    }
    if (!invId) throw new AppError('Invoice not found for payment', 404);

    const invoice = await client.query(
      `SELECT id, school_id, student_id, amount, COALESCE(total_paid, 0)::numeric(12,2) AS total_paid
       FROM finance.invoices WHERE id = $1 FOR UPDATE`,
      [invId]
    );
    if (!invoice.rows[0]) throw new AppError('Invoice not found', 404);

    const { school_id: schoolId, student_id: studentId, id: invPk, amount: dueAmount, total_paid: totalPaid } = invoice.rows[0];
    const balance = Math.max(Number(dueAmount) - Number(totalPaid), 0);
    let payAmount = Number(amount);
    if (!payAmount || payAmount <= 0) payAmount = balance;
    if (balance > 0 && payAmount > balance + 0.01) {
      throw new AppError('Payment amount exceeds invoice balance', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const payment = await client.query(
      `INSERT INTO finance.payments (school_id, invoice_id, amount, payment_method, status, idempotency_key)
       VALUES ($1, $2, $3, 'gateway', 'succeeded', $4)
       ON CONFLICT (school_id, idempotency_key) DO NOTHING
       RETURNING id`,
      [schoolId, invPk, payAmount, txRef]
    );

    const paymentId = payment.rows[0]?.id;
    if (paymentId) {
      await client.query(
        `INSERT INTO finance.paymenttransactions (school_id, payment_id, gateway, gateway_transaction_id, amount, status)
         VALUES ($1, $2, 'chapa', $3, $4, 'succeeded')
         ON CONFLICT (gateway_transaction_id) DO NOTHING`,
        [schoolId, paymentId, txRef, payAmount]
      );
    }

    const ledger = await insertLedgerAndSyncInvoice(client, {
      schoolId,
      invoiceId: invPk,
      studentId,
      paymentId,
      type: 'payment',
      method: 'chapa',
      amount: payAmount,
      chapaTxRef: txRef,
      idempotencyKey: txRef,
      notes: 'Chapa webhook',
    });

    if (ledger.ledgerId) {
      await recordCommission(client, {
        schoolId,
        sourceTxId: ledger.ledgerId,
        grossAmount: payAmount,
      });
    }

    await client.query(
      `UPDATE finance.chapa_payment_sessions
       SET status = 'success', chapa_status = $2, completed_at = now(), updated_at = now()
       WHERE tx_ref = $1`,
      [txRef, status || 'success']
    );

    await client.query('COMMIT');
    return { ok: true, invoiceStatus: ledger.invoiceStatus };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

/** @deprecated alias — use settleChapaPayment */
export const processChapaWebhook = settleChapaPayment;

export const listPlatformTransactions = async ({ schoolId, type, limit = 100, offset = 0 } = {}) => {
  const params = [];
  let sql = `
    SELECT ft.*, s.name AS school_name,
           st.first_name AS student_first_name, st.last_name AS student_last_name
    FROM finance.financial_transactions ft
    JOIN tenancy.schools s ON s.id = ft.school_id
    LEFT JOIN student.students st ON st.id = ft.student_id
    WHERE s.id != '00000000-0000-0000-0000-000000000001'`;
  if (schoolId) {
    params.push(schoolId);
    sql += ` AND ft.school_id = $${params.length}`;
  }
  if (type) {
    params.push(type);
    sql += ` AND ft.type = $${params.length}`;
  }
  params.push(limit, offset);
  sql += ` ORDER BY ft.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
  return (await query(sql, params)).rows;
};

export const listPlatformCommissions = async ({ schoolId, limit = 100 } = {}) => {
  const params = [];
  let sql = `
    SELECT pc.*, s.name AS school_name
    FROM finance.platform_commissions pc
    JOIN tenancy.schools s ON s.id = pc.school_id
    WHERE 1=1`;
  if (schoolId) {
    params.push(schoolId);
    sql += ` AND pc.school_id = $${params.length}`;
  }
  params.push(limit);
  sql += ` ORDER BY pc.created_at DESC LIMIT $${params.length}`;
  return (await query(sql, params)).rows;
};

export const listPlatformBillingInvoices = async ({ status, limit = 50 } = {}) => {
  const params = [];
  let sql = `
    SELECT pbi.*, s.name AS school_name
    FROM finance.platform_billing_invoices pbi
    JOIN tenancy.schools s ON s.id = pbi.school_id
    WHERE 1=1`;
  if (status) {
    params.push(status);
    sql += ` AND pbi.status = $${params.length}`;
  }
  params.push(limit);
  sql += ` ORDER BY pbi.created_at DESC LIMIT $${params.length}`;
  return (await query(sql, params)).rows;
};

export const getPlatformFinanceOverview = async () => {
  const [commissions, billing, txVolume] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(commission_etb), 0)::numeric(12,2) AS total,
              COALESCE(SUM(CASE WHEN settled = false THEN commission_etb ELSE 0 END), 0)::numeric(12,2) AS pending
       FROM finance.platform_commissions`
    ).catch(() => ({ rows: [{ total: 0, pending: 0 }] })),
    query(
      `SELECT status, COUNT(*)::int AS count, COALESCE(SUM(total), 0)::numeric(12,2) AS amount
       FROM finance.platform_billing_invoices
       GROUP BY status`
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT COALESCE(SUM(amount), 0)::numeric(12,2) AS volume
       FROM finance.financial_transactions
       WHERE type = 'payment' AND created_at >= NOW() - INTERVAL '30 days'`
    ).catch(() => ({ rows: [{ volume: 0 }] })),
  ]);

  const schools = await query(
    `SELECT plan::text AS plan, COUNT(*)::int AS count
     FROM tenancy.schools
     WHERE id != '00000000-0000-0000-0000-000000000001' AND COALESCE(is_deleted, false) = false
     GROUP BY plan`
  );

  return {
    commissions: commissions.rows[0],
    billing_by_status: billing.rows,
    payment_volume_30d: txVolume.rows[0]?.volume ?? 0,
    schools_by_plan: schools.rows,
  };
};
