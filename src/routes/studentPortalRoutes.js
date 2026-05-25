import express from 'express';
import { requireTenant, requireRole } from '../middlewares/authMiddleware.js';
import * as ctrl from '../controllers/studentPortalController.js';

const router = express.Router();
router.use(requireTenant, requireRole('STUDENT'));

router.get('/dashboard', ctrl.dashboard);
router.get('/profile', ctrl.profile);
router.post('/change-password', ctrl.changePassword);
router.get('/timetable', ctrl.timetable);
router.get('/attendance', ctrl.attendance);
router.get('/exams', ctrl.exams);
router.get('/fees', ctrl.fees);
router.get('/announcements', ctrl.announcements);
router.get('/report-card', ctrl.reportCard);

export default router;
