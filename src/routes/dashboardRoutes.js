import express from 'express';
import { requireTenant, requireRole } from '../middlewares/authMiddleware.js';
import * as ctrl from '../controllers/dashboard/dashboardController.js';

const router = express.Router();
router.use(requireTenant);
router.get('/stats', requireRole('SCHOOL_ADMIN', 'SUPER_ADMIN'), ctrl.getStats);
router.get('/activity', requireRole('SCHOOL_ADMIN', 'SUPER_ADMIN'), ctrl.getActivity);
export default router;
