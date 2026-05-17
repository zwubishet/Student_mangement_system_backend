import express from 'express';
import { requireTenant, requireRole } from '../middlewares/authMiddleware.js';
import * as ctrl from '../controllers/parentPortalController.js';

const router = express.Router();
router.use(requireTenant, requireRole('PARENT'));

router.get('/dashboard', ctrl.dashboard);
router.get('/children/:studentId', ctrl.childDetail);

export default router;
