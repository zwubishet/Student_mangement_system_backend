import catchAsync from '../utils/catchAsync.js';
import { sendSuccess } from '../utils/errors.js';
import * as parentPortal from '../services/parentPortalService.js';
import * as parentChapa from '../services/parentChapaPaymentService.js';

export const dashboard = catchAsync(async (req, res) => {
  sendSuccess(res, await parentPortal.getParentChildren(req.tenant.schoolId, req.tenant.userId));
});

export const childDetail = catchAsync(async (req, res) => {
  sendSuccess(res, await parentPortal.getParentChildDetail(
    req.tenant.schoolId,
    req.tenant.userId,
    req.params.studentId
  ));
});

export const childGrades = catchAsync(async (req, res) => {
  sendSuccess(res, await parentPortal.getParentChildGrades(
    req.tenant.schoolId,
    req.tenant.userId,
    req.params.studentId,
    { term_id: req.query.term_id || undefined }
  ));
});

export const childReportCard = catchAsync(async (req, res) => {
  const buf = await parentPortal.getParentChildReportCardPdf(
    req.tenant.schoolId,
    req.tenant.userId,
    req.params.studentId,
    { term_id: req.query.term_id || undefined }
  );
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=report-card-${req.params.studentId}.pdf`);
  res.send(buf);
});

export const changePassword = catchAsync(async (req, res) => {
  sendSuccess(res, await parentPortal.changeParentPassword(
    req.tenant.schoolId,
    req.tenant.userId,
    req.body
  ));
});

export const profile = catchAsync(async (req, res) => {
  sendSuccess(res, await parentPortal.getParentContext(req.tenant.schoolId, req.tenant.userId));
});

export const payInvoiceChapa = catchAsync(async (req, res) => {
  sendSuccess(res, await parentChapa.initiateParentInvoicePayment(
    req.tenant.schoolId,
    req.tenant.userId,
    req.params.invoiceId
  ));
});

export const verifyChapaPayment = catchAsync(async (req, res) => {
  sendSuccess(res, await parentChapa.verifyParentPaymentReturn(
    req.tenant.schoolId,
    req.tenant.userId,
    req.query.tx_ref
  ));
});
