import express from 'express';
import { requireTenant, requireRole } from '../middlewares/authMiddleware.js';
import * as ctrl from '../controllers/notificationController.js';

const router = express.Router();
router.use(requireTenant);

router.get('/', requireRole('SCHOOL_ADMIN'), ctrl.list);
router.post('/sms', requireRole('SCHOOL_ADMIN'), ctrl.sendSms);
router.post('/process', requireRole('SCHOOL_ADMIN'), ctrl.processQueue);
router.post('/students/:studentId/notify-guardians', requireRole('SCHOOL_ADMIN'), ctrl.notifyGuardians);

export default router;
