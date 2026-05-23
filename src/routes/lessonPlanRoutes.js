import express from 'express';
import { requireTenant, requireRole } from '../middlewares/authMiddleware.js';
import * as ctrl from '../controllers/planning/lessonPlanController.js';

const router = express.Router();
const admin = requireRole('SCHOOL_ADMIN');
const teacher = requireRole('TEACHER', 'SCHOOL_ADMIN');
const reader = requireRole('TEACHER', 'SCHOOL_ADMIN', 'FINANCE');

router.use(requireTenant);

router.get('/overview', reader, ctrl.overview);
router.get('/period-configs', admin, ctrl.periodConfigs);

router.get('/annual', reader, ctrl.listAnnual);
router.get('/annual/:id', reader, ctrl.getAnnual);
router.post('/annual', teacher, ctrl.saveAnnual);
router.post('/annual/:id/submit', teacher, ctrl.submitAnnual);
router.post('/annual/:id/review', admin, ctrl.reviewAnnual);

router.get('/daily', reader, ctrl.listDaily);
router.get('/daily/:id', reader, ctrl.getDaily);
router.post('/daily', teacher, ctrl.saveDaily);
router.post('/daily/:id/taught', teacher, ctrl.markTaught);
router.get('/lesson-context', reader, ctrl.lessonContext);
router.get('/assignments', reader, ctrl.teacherAssignments);
router.get('/behind-schedule', reader, ctrl.behindSchedule);

router.get('/units/:unitId', reader, ctrl.getUnit);
router.post('/units/:unitId/weekly', teacher, ctrl.saveWeekly);

router.post('/ca', teacher, ctrl.recordCa);
router.post('/ca/bulk', teacher, ctrl.bulkCa);
router.delete('/ca/:id', teacher, ctrl.deleteCa);
router.get('/ca/section-sheet', teacher, ctrl.sectionCaSheet);
router.get('/ca/student/:studentId', reader, ctrl.studentCaSummary);

router.get('/term-report', reader, ctrl.termReportCards);

export default router;
