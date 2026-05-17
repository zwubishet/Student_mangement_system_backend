import express from 'express';
import {
  capturePayment,
  createFeeStructure,
  generateInvoices,
  listFeeStructures,
  listInvoices,
} from '../controllers/finance/financeController.js';
import { requireRole, requireTenant } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(requireTenant);

router.get('/fee-structures', requireRole('SCHOOL_ADMIN', 'SUPER_ADMIN'), listFeeStructures);
router.post('/fee-structures', requireRole('SCHOOL_ADMIN', 'SUPER_ADMIN'), createFeeStructure);
router.get('/invoices', requireRole('SCHOOL_ADMIN', 'SUPER_ADMIN'), listInvoices);
router.post('/invoices/generate', requireRole('SCHOOL_ADMIN', 'SUPER_ADMIN'), generateInvoices);
router.post('/payments', requireRole('SCHOOL_ADMIN', 'SUPER_ADMIN'), capturePayment);

export default router;
