import Joi from 'joi';
import { getClient, query } from '../../config/db.js';
import AppError from '../../utils/appError.js';
import catchAsync from '../../utils/catchAsync.js';
import { auditLog } from '../../utils/audit.js';

const money = Joi.number().precision(2).positive().required();

const feeStructureSchema = Joi.object({
  gradeId: Joi.string().uuid().required(),
  name: Joi.string().trim().min(2).max(120).required(),
  items: Joi.array().items(Joi.object({
    name: Joi.string().trim().min(2).max(120).required(),
    amount: money,
  })).min(1).max(40).required(),
});

const generateInvoicesSchema = Joi.object({
  feeStructureId: Joi.string().uuid().required(),
  gradeId: Joi.string().uuid(),
  sectionId: Joi.string().uuid(),
  dueDate: Joi.date().iso().required(),
}).xor('gradeId', 'sectionId');

const capturePaymentSchema = Joi.object({
  invoiceId: Joi.string().uuid().required(),
  amount: money,
  paymentMethod: Joi.string().trim().valid('cash', 'card', 'bank_transfer', 'mobile_money', 'gateway').default('gateway'),
  gateway: Joi.string().trim().max(60).default('simulated'),
  gatewayTransactionId: Joi.string().trim().max(160),
  idempotencyKey: Joi.string().trim().max(160),
});

const validate = (schema, body) => {
  const { value, error } = schema.validate(body, { abortEarly: false, stripUnknown: true });
  if (error) throw new AppError(error.details.map((detail) => detail.message).join(', '), 400);
  return value;
};

export const listFeeStructures = catchAsync(async (req, res) => {
  const { schoolId } = req.tenant;

  const result = await query(
    `SELECT fs.id, fs.name, fs.grade_id, g.name AS grade_name,
            COALESCE(SUM(fsi.amount), 0)::numeric(10,2) AS total_amount,
            COUNT(fsi.id)::int AS item_count,
            COALESCE(
              json_agg(
                json_build_object('id', fsi.id, 'name', fsi.name, 'amount', fsi.amount)
                ORDER BY fsi.name
              ) FILTER (WHERE fsi.id IS NOT NULL),
              '[]'
            ) AS items
     FROM finance.feestructures fs
     JOIN academic.grades g ON g.id = fs.grade_id AND g.school_id = fs.school_id
     LEFT JOIN finance.feestructureitems fsi ON fsi.fee_structure_id = fs.id
     WHERE fs.school_id = $1
     GROUP BY fs.id, g.name
     ORDER BY g.name, fs.name`,
    [schoolId]
  );

  res.json({ feeStructures: result.rows });
});

export const createFeeStructure = catchAsync(async (req, res, next) => {
  const { schoolId, userId } = req.tenant;
  const input = validate(feeStructureSchema, req.body);
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const grade = await client.query(
      `SELECT id FROM academic.grades WHERE id = $1 AND school_id = $2`,
      [input.gradeId, schoolId]
    );
    if (grade.rowCount === 0) throw new AppError('Grade does not belong to this school.', 404);

    const structure = await client.query(
      `INSERT INTO finance.feestructures (school_id, grade_id, name)
       VALUES ($1, $2, $3)
       RETURNING id, name, grade_id`,
      [schoolId, input.gradeId, input.name]
    );

    const feeStructureId = structure.rows[0].id;
    const items = [];
    for (const item of input.items) {
      const inserted = await client.query(
        `INSERT INTO finance.feestructureitems (fee_structure_id, name, amount)
         VALUES ($1, $2, $3)
         RETURNING id, name, amount`,
        [feeStructureId, item.name, item.amount]
      );
      items.push(inserted.rows[0]);
    }

    await auditLog(client, {
      schoolId,
      userId,
      action: 'CREATE',
      entityType: 'finance.feestructures',
      entityId: feeStructureId,
    });

    await client.query('COMMIT');
    res.status(201).json({ feeStructure: { ...structure.rows[0], items } });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

export const generateInvoices = catchAsync(async (req, res, next) => {
  const { schoolId, userId } = req.tenant;
  const input = validate(generateInvoicesSchema, req.body);
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const fee = await client.query(
      `SELECT fs.id, fs.grade_id, COALESCE(SUM(fsi.amount), 0)::numeric(10,2) AS total_amount
       FROM finance.feestructures fs
       LEFT JOIN finance.feestructureitems fsi ON fsi.fee_structure_id = fs.id
       WHERE fs.id = $1 AND fs.school_id = $2
       GROUP BY fs.id`,
      [input.feeStructureId, schoolId]
    );
    if (fee.rowCount === 0) throw new AppError('Fee structure not found for this school.', 404);
    if (Number(fee.rows[0].total_amount) <= 0) throw new AppError('Fee structure has no billable items.', 400);

    const roster = await client.query(
      `SELECT DISTINCT s.id AS student_id
       FROM student.studentenrollments se
       JOIN student.students s ON s.id = se.student_id AND s.school_id = se.school_id
       JOIN academic.sections sec ON sec.id = se.section_id
       JOIN academic.grades g ON g.id = sec.grade_id AND g.school_id = s.school_id
       WHERE se.school_id = $1
         AND se.status = 'active'
         AND (($2::uuid IS NOT NULL AND g.id = $2) OR ($3::uuid IS NOT NULL AND sec.id = $3))
       ORDER BY s.id`,
      [schoolId, input.gradeId || null, input.sectionId || null]
    );

    const items = await client.query(
      `SELECT id, name, amount FROM finance.feestructureitems WHERE fee_structure_id = $1 ORDER BY name`,
      [input.feeStructureId]
    );

    let generated = 0;
    let reused = 0;
    const invoiceIds = [];

    for (const row of roster.rows) {
      const invoice = await client.query(
        `INSERT INTO finance.invoices (school_id, student_id, fee_structure_id, amount, due_date, status, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', now())
         ON CONFLICT (school_id, student_id, fee_structure_id, due_date)
         DO UPDATE SET amount = EXCLUDED.amount, updated_at = now()
         RETURNING id, (xmax = 0) AS inserted`,
        [schoolId, row.student_id, input.feeStructureId, fee.rows[0].total_amount, input.dueDate]
      );

      const invoiceId = invoice.rows[0].id;
      invoiceIds.push(invoiceId);
      if (invoice.rows[0].inserted) generated += 1;
      else reused += 1;

      await client.query(`DELETE FROM finance.invoiceitems WHERE invoice_id = $1`, [invoiceId]);
      for (const item of items.rows) {
        await client.query(
          `INSERT INTO finance.invoiceitems (school_id, invoice_id, fee_structure_item_id, name, amount)
           VALUES ($1, $2, $3, $4, $5)`,
          [schoolId, invoiceId, item.id, item.name, item.amount]
        );
      }
    }

    await auditLog(client, {
      schoolId,
      userId,
      action: 'BULK_GENERATE',
      entityType: 'finance.invoices',
      entityId: invoiceIds[0] || null,
    });

    await client.query('COMMIT');
    res.status(201).json({ generated, reused, total: roster.rowCount, invoiceIds });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

export const listInvoices = catchAsync(async (req, res) => {
  const { schoolId } = req.tenant;
  const status = req.query.status || null;

  const result = await query(
    `WITH payment_totals AS (
       SELECT invoice_id, COALESCE(SUM(amount), 0)::numeric(10,2) AS paid_amount
       FROM finance.payments
       WHERE school_id = $1 AND status = 'succeeded'
       GROUP BY invoice_id
     )
     SELECT i.id, i.student_id, i.amount, i.due_date, i.status, i.created_at,
            s.first_name, s.last_name, s.admission_number,
            fs.name AS fee_structure_name,
            COALESCE(pt.paid_amount, 0)::numeric(10,2) AS paid_amount,
            (i.amount - COALESCE(pt.paid_amount, 0))::numeric(10,2) AS balance,
            COALESCE(
              json_agg(
                json_build_object('id', ii.id, 'name', ii.name, 'amount', ii.amount)
                ORDER BY ii.name
              ) FILTER (WHERE ii.id IS NOT NULL),
              '[]'
            ) AS items
     FROM finance.invoices i
     JOIN student.students s ON s.id = i.student_id AND s.school_id = i.school_id
     LEFT JOIN finance.feestructures fs ON fs.id = i.fee_structure_id
     LEFT JOIN finance.invoiceitems ii ON ii.invoice_id = i.id
     LEFT JOIN payment_totals pt ON pt.invoice_id = i.id
     WHERE i.school_id = $1 AND ($2::text IS NULL OR i.status = $2)
     GROUP BY i.id, s.id, fs.name, pt.paid_amount
     ORDER BY i.created_at DESC
     LIMIT 200`,
    [schoolId, status]
  );

  res.json({ invoices: result.rows });
});

export const capturePayment = catchAsync(async (req, res, next) => {
  const { schoolId, userId } = req.tenant;
  const input = validate(capturePaymentSchema, req.body);
  const idempotencyKey = input.idempotencyKey || input.gatewayTransactionId || `${input.invoiceId}:${input.amount}`;
  const gatewayTransactionId = input.gatewayTransactionId || `sim_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const invoice = await client.query(
      `SELECT id, amount FROM finance.invoices WHERE id = $1 AND school_id = $2 FOR UPDATE`,
      [input.invoiceId, schoolId]
    );
    if (invoice.rowCount === 0) throw new AppError('Invoice not found for this school.', 404);

    const payment = await client.query(
      `INSERT INTO finance.payments (school_id, invoice_id, amount, payment_method, status, idempotency_key, received_by)
       VALUES ($1, $2, $3, $4, 'succeeded', $5, $6)
       ON CONFLICT (school_id, idempotency_key)
       DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
       RETURNING id, invoice_id, amount, status, created_at`,
      [schoolId, input.invoiceId, input.amount, input.paymentMethod, idempotencyKey, userId]
    );

    await client.query(
      `INSERT INTO finance.paymenttransactions (school_id, payment_id, gateway, gateway_transaction_id, amount, status)
       VALUES ($1, $2, $3, $4, $5, 'succeeded')
       ON CONFLICT (gateway_transaction_id)
       DO NOTHING`,
      [schoolId, payment.rows[0].id, input.gateway, gatewayTransactionId, input.amount]
    );

    const total = await client.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric(10,2) AS paid_amount
       FROM finance.payments
       WHERE school_id = $1 AND invoice_id = $2 AND status = 'succeeded'`,
      [schoolId, input.invoiceId]
    );

    const paidAmount = Number(total.rows[0].paid_amount);
    const invoiceAmount = Number(invoice.rows[0].amount);
    const nextStatus = paidAmount >= invoiceAmount ? 'paid' : paidAmount > 0 ? 'partial' : 'pending';

    await client.query(
      `UPDATE finance.invoices SET status = $1, updated_at = now() WHERE id = $2 AND school_id = $3`,
      [nextStatus, input.invoiceId, schoolId]
    );

    await auditLog(client, {
      schoolId,
      userId,
      action: 'CREATE',
      entityType: 'finance.payments',
      entityId: payment.rows[0].id,
    });

    await client.query('COMMIT');
    res.status(201).json({
      payment: payment.rows[0],
      invoiceStatus: nextStatus,
      paidAmount,
      gatewayTransactionId,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});
