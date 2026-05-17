import express from 'express';
import { requireTenant, requireRole } from '../middlewares/authMiddleware.js';
import * as ctrl from '../controllers/teacherPortalController.js';

const router = express.Router();
router.use(requireTenant, requireRole('TEACHER'));

router.get('/dashboard', ctrl.dashboard);
router.get('/classes', ctrl.classes);
router.get('/classes/:sectionId', ctrl.classDetail);
router.get('/students', ctrl.students);
router.get('/students/:studentId', ctrl.studentDetail);
router.get('/sections/:sectionId/attendance', ctrl.getAttendance);
router.post('/sections/:sectionId/attendance', ctrl.markAttendance);

export default router;
