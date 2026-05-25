import Joi from 'joi';
import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess } from '../../utils/errors.js';
import AppError from '../../utils/appError.js';
import * as financeService from '../../services/finance/financeService.js';
import * as studentFeeService from '../../services/finance/studentFeeService.js';
import { getClient } from '../../config/db.js';
import { auditLog } from '../../utils/audit.js';

const money = Joi.number().precision(2).min(0).required();

const validate = (schema, body) => {
  const { value, error } = schema.validate(body, { abortEarly: false, stripUnknown: true });
  if (error) throw new AppError(error.details.map((d) => d.message).join(', '), 400);
  return value;
};

export const getDashboard = catchAsync(async (req, res) => {
  const data = await financeService.getFinanceDashboard(req.tenant.schoolId);
  sendSuccess(res, data);
});

export const getCategories = catchAsync(async (req, res) => {
  const enriched = req.query.enriched === '1' || req.query.enriched === 'true';
  const data = enriched
    ? await studentFeeService.listCategoriesEnriched(req.tenant.schoolId)
    : await financeService.listFeeCategories(req.tenant.schoolId);
  sendSuccess(res, data);
});

export const postCategory = catchAsync(async (req, res) => {
  const input = validate(Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    code: Joi.string().trim().max(40).allow('', null),
    is_mandatory: Joi.boolean(),
    category_type: Joi.string().valid('mandatory', 'optional'),
    frequency: Joi.string().valid('annual', 'term', 'monthly', 'one_time'),
    description: Joi.string().max(500).allow('', null),
    default_amount: Joi.number().min(0).allow(null),
  }), req.body);
  const data = await financeService.createFeeCategory(req.tenant.schoolId, input);
  sendSuccess(res, data, 201);
});

export const getSubscriptionMatrix = catchAsync(async (req, res) => {
  const data = await studentFeeService.listSubscriptionMatrix(req.tenant.schoolId, {
    academicYear: req.query.academic_year,
    gradeId: req.query.grade_id,
    sectionId: req.query.section_id,
    search: req.query.search,
  });
  sendSuccess(res, data);
});

export const getStudentSubscriptions = catchAsync(async (req, res) => {
  const data = await studentFeeService.listStudentAssignments(
    req.tenant.schoolId,
    req.params.studentId,
    req.query.academic_year
  );
  sendSuccess(res, data);
});

export const putStudentSubscriptions = catchAsync(async (req, res) => {
  const input = validate(Joi.object({
    academic_year: Joi.string().trim().max(9).required(),
    categories: Joi.array().items(Joi.object({
      fee_category_id: Joi.string().uuid().required(),
      custom_amount: Joi.number().min(0).allow(null),
      frequency: Joi.string().valid('annual', 'term', 'monthly', 'one_time').allow(null),
      notes: Joi.string().max(300).allow('', null),
    })).required(),
  }), req.body);
  const data = await studentFeeService.setStudentSubscriptions(
    req.tenant.schoolId,
    req.params.studentId,
    input.academic_year,
    input.categories,
    req.tenant.userId
  );
  sendSuccess(res, data);
});

export const postSyncMandatorySubscriptions = catchAsync(async (req, res) => {
  const input = validate(Joi.object({
    academic_year: Joi.string().trim().max(9).required(),
  }), req.body);
  const data = await studentFeeService.syncMandatorySubscriptions(
    req.tenant.schoolId,
    input.academic_year,
    req.tenant.userId
  );
  sendSuccess(res, data, 201);
});

export const getBillingSetup = catchAsync(async (req, res) => {
  const academicYear = req.query.academic_year;
  if (!academicYear) throw new AppError('academic_year is required', 400);
  const data = await studentFeeService.getBillingSetupStatus(req.tenant.schoolId, academicYear);
  sendSuccess(res, data);
});

export const getPreviewTermInvoices = catchAsync(async (req, res) => {
  const input = validate(Joi.object({
    academic_year: Joi.string().trim().max(9).required(),
    term: Joi.number().integer().min(1).max(3).allow(null),
    grade_id: Joi.string().uuid().allow(null),
  }), req.query);
  const data = await studentFeeService.previewTermInvoices(req.tenant.schoolId, input);
  sendSuccess(res, data);
});

export const postRepairTermBilling = catchAsync(async (req, res) => {
  const data = await studentFeeService.repairTermBillingCategories(req.tenant.schoolId);
  sendSuccess(res, data);
});

export const getStudentBillingRoster = catchAsync(async (req, res) => {
  const input = validate(Joi.object({
    academic_year: Joi.string().trim().max(9).required(),
    term: Joi.number().integer().min(1).max(3).allow(null),
    grade_id: Joi.string().uuid().allow(null),
  }), req.query);
  const data = await studentFeeService.listStudentBillingRoster(req.tenant.schoolId, input);
  sendSuccess(res, data);
});

export const postBootstrapBilling = catchAsync(async (req, res) => {
  const input = validate(Joi.object({
    academic_year: Joi.string().trim().max(9).required(),
    term: Joi.number().integer().min(1).max(3).default(1),
  }), req.body);
  const data = await studentFeeService.bootstrapSchoolFeeBilling(
    req.tenant.schoolId,
    input.academic_year,
    req.tenant.userId,
    { term: input.term }
  );
  sendSuccess(res, data, 201);
});

export const getSchedules = catchAsync(async (req, res) => {
  const data = await financeService.listFeeSchedules(req.tenant.schoolId, {
    academicYear: req.query.academic_year,
    gradeId: req.query.grade_id,
  });
  sendSuccess(res, data);
});

export const postSchedule = catchAsync(async (req, res) => {
  const input = validate(Joi.object({
    fee_category_id: Joi.string().uuid().required(),
    grade_id: Joi.string().uuid().allow(null),
    academic_year: Joi.string().trim().max(9).required(),
    term: Joi.number().integer().min(1).max(3).allow(null),
    amount: money,
    currency: Joi.string().length(3).default('ETB'),
  }), req.body);
  const data = await financeService.createFeeSchedule(req.tenant.schoolId, input);
  sendSuccess(res, data, 201);
});

export const getDiscounts = catchAsync(async (req, res) => {
  const data = await financeService.listDiscountRules(req.tenant.schoolId);
  sendSuccess(res, data);
});

export const postDiscount = catchAsync(async (req, res) => {
  const input = validate(Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    type: Joi.string().valid('percentage', 'fixed').required(),
    value: money,
    applies_to: Joi.string().valid('all', 'tuition_only').default('all'),
  }), req.body);
  const data = await financeService.createDiscountRule(req.tenant.schoolId, input);
  sendSuccess(res, data, 201);
});

export const getPaymentPlans = catchAsync(async (req, res) => {
  const data = await financeService.listPaymentPlans(req.tenant.schoolId);
  sendSuccess(res, data);
});

export const postPaymentPlan = catchAsync(async (req, res) => {
  const input = validate(Joi.object({
    name: Joi.string().trim().min(2).max(80).required(),
    plan_type: Joi.string().valid('full', 'term', 'monthly').default('full'),
    installments: Joi.number().integer().min(1).max(12).default(1),
    is_default: Joi.boolean(),
  }), req.body);
  const data = await financeService.createPaymentPlan(req.tenant.schoolId, input);
  sendSuccess(res, data, 201);
});

export const postGenerateTermInvoices = catchAsync(async (req, res) => {
  const input = validate(Joi.object({
    academic_year: Joi.string().trim().max(9).required(),
    term: Joi.number().integer().min(1).max(3).allow(null),
    grade_id: Joi.string().uuid().allow(null),
    due_date: Joi.date().iso(),
    discount_rule_id: Joi.string().uuid().allow(null),
    payment_plan_id: Joi.string().uuid().allow(null),
    notes: Joi.string().max(500).allow('', null),
  }), req.body);
  const roles = req.tenant?.roles || [];
  const isAdmin = roles.includes('SCHOOL_ADMIN') || req.tenant?.isPlatformManage;
  if (!isAdmin) {
    throw new AppError('School admin must approve fee generation. Submit a fee request instead.', 403);
  }
  const data = await financeService.generateTermInvoices(
    req.tenant.schoolId,
    req.tenant.userId,
    input
  );
  sendSuccess(res, data, 201);
});

export const getLedger = catchAsync(async (req, res) => {
  const data = await financeService.listLedger(req.tenant.schoolId, {
    studentId: req.query.student_id,
    limit: req.query.limit ? Number(req.query.limit) : 50,
    offset: req.query.offset ? Number(req.query.offset) : 0,
  });
  sendSuccess(res, data);
});

export const getPlatformTransactions = catchAsync(async (req, res) => {
  const { listPlatformTransactions } = await import('../../services/finance/financeService.js');
  const data = await listPlatformTransactions({
    schoolId: req.query.school_id,
    type: req.query.type,
    limit: req.query.limit ? Number(req.query.limit) : 100,
    offset: req.query.offset ? Number(req.query.offset) : 0,
  });
  sendSuccess(res, data);
});

export const getPlatformCommissionsList = catchAsync(async (req, res) => {
  const { listPlatformCommissions } = await import('../../services/finance/financeService.js');
  const data = await listPlatformCommissions({
    schoolId: req.query.school_id,
    limit: req.query.limit ? Number(req.query.limit) : 100,
  });
  sendSuccess(res, data);
});

export const getPlatformBilling = catchAsync(async (req, res) => {
  const { listPlatformBillingInvoices } = await import('../../services/finance/financeService.js');
  const data = await listPlatformBillingInvoices({
    status: req.query.status,
  });
  sendSuccess(res, data);
});

const handleChapaSettlement = async (req) => {
  const body = req.body?.data || req.body || req.query || {};
  const txRef = body.tx_ref || body.trx_ref || body.reference || req.query?.tx_ref || req.query?.trx_ref;
  if (!txRef) return { skipped: true, reason: 'no_tx_ref' };

  const { verifyTransaction, extractVerifiedPayment, verifyWebhookSignature, isChapaConfigured } =
    await import('../../services/finance/chapaService.js');

  if (req.method === 'POST' && isChapaConfigured() && !verifyWebhookSignature(req)) {
    return { skipped: true, reason: 'invalid_signature' };
  }

  let status = body.status;
  let amount = body.amount;
  let invoiceId = body.meta?.invoice_id || body.metadata?.invoice_id;
  let metadata = body.meta || body.metadata;

  if (isChapaConfigured()) {
    try {
      const verified = extractVerifiedPayment(await verifyTransaction(txRef));
      if (verified.ok) {
        status = 'success';
        amount = verified.amount || amount;
        invoiceId = invoiceId || verified.meta?.invoice_id;
        metadata = { ...metadata, ...verified.meta };
      } else if (!status) {
        status = verified.status;
      }
    } catch {
      /* fall back to callback payload when verify is temporarily unavailable */
    }
  }

  return financeService.settleChapaPayment({
    txRef,
    amount,
    status,
    invoiceId,
    metadata,
  });
};

export const postChapaWebhook = catchAsync(async (req, res) => {
  res.status(200).json({ received: true });
  try {
    await handleChapaSettlement(req);
  } catch (err) {
    console.error('[chapa webhook]', err.message);
  }
});

export const getChapaCallback = catchAsync(async (req, res) => {
  try {
    const result = await handleChapaSettlement(req);
    res.status(200).json({ received: true, ...result });
  } catch (err) {
    res.status(200).json({ received: true, error: err.message });
  }
});

export const capturePaymentWithLedger = catchAsync(async (req, res, next) => {
  const { schoolId, userId } = req.tenant;
  const input = validate(Joi.object({
    invoiceId: Joi.string().uuid().required(),
    amount: Joi.number().precision(2).positive().required(),
    paymentMethod: Joi.string().trim().valid('cash', 'card', 'bank_transfer', 'mobile_money', 'gateway', 'chapa').default('cash'),
    gatewayTransactionId: Joi.string().trim().max(160),
    idempotencyKey: Joi.string().trim().max(160),
    notes: Joi.string().max(500).allow('', null),
  }), req.body);

  const idempotencyKey = input.idempotencyKey || input.gatewayTransactionId || `${input.invoiceId}:${input.amount}`;
  const methodMap = {
    cash: 'cash',
    card: 'chapa',
    bank_transfer: 'bank_transfer',
    mobile_money: 'mobile',
    gateway: 'chapa',
    chapa: 'chapa',
  };
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const invoice = await client.query(
      `SELECT id, student_id, amount FROM finance.invoices
       WHERE id = $1 AND school_id = $2 FOR UPDATE`,
      [input.invoiceId, schoolId]
    );
    if (!invoice.rows[0]) throw new AppError('Invoice not found', 404);

    const payment = await client.query(
      `INSERT INTO finance.payments (school_id, invoice_id, amount, payment_method, status, idempotency_key, received_by)
       VALUES ($1, $2, $3, $4, 'succeeded', $5, $6)
       ON CONFLICT (school_id, idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
       RETURNING id`,
      [schoolId, input.invoiceId, input.amount, input.paymentMethod, idempotencyKey, userId]
    );

    const result = await financeService.insertLedgerAndSyncInvoice(client, {
      schoolId,
      invoiceId: input.invoiceId,
      studentId: invoice.rows[0].student_id,
      paymentId: payment.rows[0].id,
      type: 'payment',
      method: methodMap[input.paymentMethod] || 'cash',
      amount: input.amount,
      recordedBy: userId,
      chapaTxRef: input.gatewayTransactionId || null,
      idempotencyKey,
      notes: input.notes,
    });

    if (input.paymentMethod === 'chapa' || input.paymentMethod === 'gateway') {
      await financeService.recordCommission(client, {
        schoolId,
        sourceTxId: result.ledgerId,
        grossAmount: input.amount,
      });
    }

    await auditLog(client, {
      schoolId,
      userId,
      action: 'PAYMENT',
      entityType: 'finance.financial_transactions',
      entityId: result.ledgerId,
    });

    await client.query('COMMIT');
    sendSuccess(res, { payment: payment.rows[0], ...result }, 201);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});
