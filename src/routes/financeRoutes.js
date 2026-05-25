import express from 'express';
import {
  capturePayment,
  createFeeStructure,
  generateInvoices,
  listFeeStructures,
  listInvoices,
} from '../controllers/finance/financeController.js';
import * as v2 from '../controllers/finance/financeV2Controller.js';
import * as portal from '../controllers/finance/financePortalController.js';
import { requireRole, requireTenant } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/webhooks/chapa', v2.postChapaWebhook);
router.get('/webhooks/chapa', v2.getChapaCallback);

router.use(requireTenant);

const financeAccess = requireRole('SCHOOL_ADMIN', 'FINANCE');
const adminOnly = requireRole('SCHOOL_ADMIN');

/* Legacy */
router.get('/fee-structures', financeAccess, listFeeStructures);
router.post('/fee-structures', financeAccess, createFeeStructure);
router.get('/invoices', financeAccess, listInvoices);
router.post('/invoices/generate', financeAccess, generateInvoices);
router.post('/payments', financeAccess, capturePayment);

/* Finance v2 */
router.get('/dashboard', financeAccess, v2.getDashboard);
router.get('/categories', financeAccess, v2.getCategories);
router.post('/categories', financeAccess, v2.postCategory);
router.get('/schedules', financeAccess, v2.getSchedules);
router.post('/schedules', financeAccess, v2.postSchedule);
router.get('/discounts', financeAccess, v2.getDiscounts);
router.post('/discounts', financeAccess, v2.postDiscount);
router.get('/payment-plans', financeAccess, v2.getPaymentPlans);
router.post('/payment-plans', financeAccess, v2.postPaymentPlan);
router.post('/invoices/generate-term', financeAccess, v2.postGenerateTermInvoices);
router.get('/ledger', financeAccess, v2.getLedger);
router.post('/payments/record', financeAccess, v2.capturePaymentWithLedger);

/* Per-student fee subscriptions (category-based billing) */
router.get('/student-fees/subscriptions', financeAccess, v2.getSubscriptionMatrix);
router.get('/student-fees/students/:studentId/subscriptions', financeAccess, v2.getStudentSubscriptions);
router.put('/student-fees/students/:studentId/subscriptions', financeAccess, v2.putStudentSubscriptions);
router.post('/student-fees/sync-mandatory', financeAccess, v2.postSyncMandatorySubscriptions);
router.get('/student-fees/billing-setup', financeAccess, v2.getBillingSetup);
router.get('/student-fees/preview-term', financeAccess, v2.getPreviewTermInvoices);
router.post('/student-fees/bootstrap', financeAccess, v2.postBootstrapBilling);
router.post('/student-fees/repair-term-billing', financeAccess, v2.postRepairTermBilling);
router.get('/student-fees/billing-roster', financeAccess, v2.getStudentBillingRoster);

/* Payroll */
router.get('/payroll/overview', financeAccess, portal.getPayrollOverview);
router.get('/payroll/staff-roster', financeAccess, portal.getPayrollStaffRoster);
router.get('/payroll/runs', financeAccess, portal.getPayrollRuns);
router.get('/payroll/runs/:id', financeAccess, portal.getPayrollRunDetail);
router.get('/payroll/candidates', financeAccess, portal.getPayrollCandidates);
router.post('/payroll/runs', financeAccess, portal.postPayrollRun);
router.patch('/payroll/runs/:runId/entries/:entryId', financeAccess, portal.patchPayrollEntry);
router.post('/payroll/runs/:id/submit', financeAccess, portal.submitPayrollRun);
router.post('/payroll/runs/:id/approve', adminOnly, portal.approvePayrollRun);
router.post('/payroll/runs/:id/reject', adminOnly, portal.rejectPayrollRun);
router.post('/payroll/runs/:id/pay', financeAccess, portal.payPayrollRun);

router.get('/approvals/pending', adminOnly, portal.getPendingApprovals);
router.get('/fee-requests', financeAccess, portal.listFeeRequests);
router.post('/fee-requests', financeAccess, portal.createFeeRequest);
router.post('/fee-requests/:id/approve', adminOnly, portal.approveFeeRequest);
router.post('/fee-requests/:id/reject', adminOnly, portal.rejectFeeRequest);

router.post('/hr-review-requests/teachers/:teacherId', financeAccess, portal.createHrReviewRequest);
router.get('/hr-review-requests', financeAccess, portal.listHrReviewRequests);
router.post('/hr-review-requests/:id/resolve', adminOnly, portal.resolveHrReviewRequest);

/* Finance team (school admin creates officers) */
router.get('/team', adminOnly, portal.listFinanceTeam);
router.post('/team', adminOnly, portal.createFinanceTeamMember);

export default router;
