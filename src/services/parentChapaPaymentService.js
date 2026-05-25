import { query } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import * as chapa from './finance/chapaService.js';
import * as financeService from './finance/financeService.js';
import { getParentContext } from './parentPortalService.js';

const assertParentInvoiceAccess = async (schoolId, parentUserId, invoiceId) => {
  const parent = await getParentContext(schoolId, parentUserId);
  const inv = await query(
    `SELECT i.id, i.school_id, i.student_id, i.amount, i.total_paid, i.status, i.academic_year, i.term,
            GREATEST(i.amount - COALESCE(i.total_paid, 0), 0)::numeric(12,2) AS balance,
            s.first_name AS student_first_name, s.last_name AS student_last_name
     FROM finance.invoices i
     JOIN student.students s ON s.id = i.student_id
     JOIN academic.parentstudents ps ON ps.student_id = i.student_id AND ps.parent_id = $1 AND ps.school_id = $2
     WHERE i.id = $3 AND i.school_id = $2`,
    [parent.id, schoolId, invoiceId]
  );
  if (!inv.rows[0]) {
    throw new AppError('Invoice not found or access denied.', 404, ERROR_CODES.NOT_FOUND);
  }
  return { parent, invoice: inv.rows[0] };
};

export const initiateParentInvoicePayment = async (schoolId, parentUserId, invoiceId) => {
  if (!chapa.isChapaConfigured()) {
    throw new AppError('Online payments are not configured. Contact the school.', 503, ERROR_CODES.INVALID_OPERATION);
  }

  const { parent, invoice } = await assertParentInvoiceAccess(schoolId, parentUserId, invoiceId);
  const balance = Number(invoice.balance);
  if (balance <= 0 || invoice.status === 'paid') {
    throw new AppError('This invoice is already paid.', 400, ERROR_CODES.VALIDATION_ERROR);
  }

  const user = await query(
    `SELECT email, first_name, last_name, phone FROM identity.users WHERE id = $1`,
    [parentUserId]
  );
  const u = user.rows[0];
  if (!u?.email) {
    throw new AppError('Your account needs an email address for Chapa checkout.', 400, ERROR_CODES.VALIDATION_ERROR);
  }
  const phone = chapa.normalizeChapaPhone(u.phone || parent.phone);
  if (!phone) {
    throw new AppError(
      'Add a valid Ethiopian mobile number (09xxxxxxxx) on your account before paying online.',
      400,
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  const txRef = chapa.buildTxRef(invoiceId);
  const returnUrl = `${chapa.frontendPublicUrl()}/parent/payment/return?tx_ref=${encodeURIComponent(txRef)}&student_id=${invoice.student_id}`;
  const callbackUrl = `${chapa.apiPublicUrl()}/api/v1/finance/webhooks/chapa`;

  const meta = {
    invoice_id: invoiceId,
    school_id: schoolId,
    student_id: invoice.student_id,
    parent_user_id: parentUserId,
  };

  const init = await chapa.initializeTransaction({
    amount: balance,
    email: u.email,
    firstName: u.first_name || parent.first_name || 'Parent',
    lastName: u.last_name || parent.last_name || 'Guardian',
    phoneNumber: phone,
    txRef,
    callbackUrl,
    returnUrl,
    title: 'School fee',
    description: [
      invoice.student_first_name,
      invoice.student_last_name,
      invoice.academic_year,
      invoice.term ? `Term ${invoice.term}` : '',
    ].filter(Boolean).join(' '),
    meta,
  });

  await query(
    `INSERT INTO finance.chapa_payment_sessions (
       school_id, invoice_id, student_id, parent_user_id, tx_ref, amount, checkout_url, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      schoolId,
      invoiceId,
      invoice.student_id,
      parentUserId,
      txRef,
      balance,
      init.checkoutUrl,
      JSON.stringify(meta),
    ]
  );

  return {
    checkout_url: init.checkoutUrl,
    tx_ref: txRef,
    amount: balance,
    currency: 'ETB',
    mode: init.mode,
  };
};

export const verifyParentPaymentReturn = async (schoolId, parentUserId, txRef) => {
  if (!txRef) throw new AppError('Missing payment reference.', 400, ERROR_CODES.VALIDATION_ERROR);

  const session = await query(
    `SELECT * FROM finance.chapa_payment_sessions
     WHERE tx_ref = $1 AND school_id = $2 AND parent_user_id = $3`,
    [txRef, schoolId, parentUserId]
  );
  if (!session.rows[0]) {
    throw new AppError('Payment session not found.', 404, ERROR_CODES.NOT_FOUND);
  }
  const row = session.rows[0];
  if (row.status === 'success') {
    return { status: 'success', tx_ref: txRef, invoice_id: row.invoice_id, already_settled: true };
  }

  const verifyRes = await chapa.verifyTransaction(txRef);
  const verified = chapa.extractVerifiedPayment(verifyRes);

  if (!verified.ok) {
    await query(
      `UPDATE finance.chapa_payment_sessions
       SET status = 'failed', chapa_status = $2, updated_at = now()
       WHERE tx_ref = $1`,
      [txRef, verified.status || 'failed']
    );
    return { status: verified.status || 'failed', tx_ref: txRef, message: 'Payment was not completed.' };
  }

  const result = await financeService.settleChapaPayment({
    txRef,
    amount: verified.amount || Number(row.amount),
    status: 'success',
    invoiceId: verified.meta?.invoice_id || row.invoice_id,
    metadata: verified.meta,
  });

  await query(
    `UPDATE finance.chapa_payment_sessions
     SET status = 'success', chapa_status = $2, completed_at = now(), updated_at = now()
     WHERE tx_ref = $1`,
    [txRef, verified.status]
  );

  return {
    status: 'success',
    tx_ref: txRef,
    invoice_id: row.invoice_id,
    invoice_status: result.invoiceStatus,
    amount: verified.amount || Number(row.amount),
  };
};
