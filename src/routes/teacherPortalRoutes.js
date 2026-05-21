import express from 'express';
import { requireTenant, requireRole } from '../middlewares/authMiddleware.js';
import { validate } from '../middlewares/validate.js';
import { submitExamMarksSchema } from '../utils/schemas.js';
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

router.get('/exams', ctrl.listExams);
router.get('/exams/:examId/schedules/:scheduleId/marks', ctrl.getMarkSheet);
router.post(
  '/exams/:examId/schedules/:scheduleId/marks',
  validate(submitExamMarksSchema),
  ctrl.saveMarks
);
router.post('/exams/:examId/schedules/:scheduleId/submit', ctrl.submitMarks);

router.get('/notifications', ctrl.notifications);
router.get('/me', ctrl.me);
router.get('/timetable', ctrl.timetable);
router.get('/sections/:sectionId/roster/export', ctrl.exportRoster);
router.get('/sections/:sectionId/report-preview', ctrl.classReport);
router.get('/sections/:sectionId/guardians', ctrl.guardianDirectory);

export default router;
