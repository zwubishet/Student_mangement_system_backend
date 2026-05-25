import express from 'express';
import { requireTenant, requireRole } from '../middlewares/authMiddleware.js';
import * as ctrl from '../controllers/parentPortalController.js';

const router = express.Router();
router.use(requireTenant, requireRole('PARENT'));

router.get('/dashboard', ctrl.dashboard);
router.get('/profile', ctrl.profile);
router.post('/change-password', ctrl.changePassword);
router.get('/children/:studentId', ctrl.childDetail);
router.get('/children/:studentId/grades', ctrl.childGrades);
router.get('/children/:studentId/report-card', ctrl.childReportCard);
router.post('/invoices/:invoiceId/pay-chapa', ctrl.payInvoiceChapa);
router.get('/payments/chapa/verify', ctrl.verifyChapaPayment);

export default router;
