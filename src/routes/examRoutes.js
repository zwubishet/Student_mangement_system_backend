import express from 'express';
import { requireTenant, requireRole } from '../middlewares/authMiddleware.js';
import { validate, validateQuery } from '../middlewares/validate.js';
import { paginationSchema } from '../utils/pagination.js';
import {
  createExamBodySchema,
  updateExamBodySchema,
  examScheduleSchema,
  updateExamScheduleSchema,
  submitExamMarksSchema,
  gradingScaleSchema,
} from '../utils/schemas.js';
import * as ctrl from '../controllers/academic/examController.js';

const router = express.Router();
const admin = requireRole('SCHOOL_ADMIN');
const staff = requireRole('SCHOOL_ADMIN', 'TEACHER');

router.use(requireTenant, staff);

router.get('/overview', admin, ctrl.getOverview);
router.get('/grading-scales', admin, ctrl.listGradingScales);
router.post('/grading-scales', admin, validate(gradingScaleSchema), ctrl.upsertGradingScale);
router.delete('/grading-scales/:scaleId', admin, ctrl.deleteGradingScale);

router.post('/terms/:termId/calculate-results', admin, ctrl.calculateTerm);

router.get('/', validateQuery(paginationSchema), ctrl.list);
router.post('/', admin, validate(createExamBodySchema), ctrl.create);
router.get('/:id', ctrl.getOne);
router.patch('/:id', admin, validate(updateExamBodySchema), ctrl.update);
router.delete('/:id', admin, ctrl.remove);

router.get('/:id/schedules', ctrl.listSchedules);
router.post('/:id/schedules', admin, validate(examScheduleSchema), ctrl.addSchedule);
router.patch('/:id/schedules/:scheduleId', admin, validate(updateExamScheduleSchema), ctrl.patchSchedule);
router.delete('/:id/schedules/:scheduleId', admin, ctrl.deleteSchedule);

router.get('/:id/schedules/:scheduleId/marks', ctrl.getMarkSheet);
router.post('/:id/schedules/:scheduleId/marks', staff, validate(submitExamMarksSchema), ctrl.submitMarks);
router.post('/:id/schedules/:scheduleId/verify', admin, ctrl.verifyMarks);

router.get('/:id/results', validateQuery(paginationSchema), ctrl.getResults);

export default router;
