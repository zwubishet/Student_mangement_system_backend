import express from 'express';
import { requireTenant, requireRole } from '../middlewares/authMiddleware.js';
import { validate, validateQuery } from '../middlewares/validate.js';
import { paginationSchema } from '../utils/pagination.js';
import {
  createGradingScaleProfileSchema,
  termAssessmentWeightsSchema,
  rejectMarksSchema,
  scheduleConflictQuerySchema,
  bulkMarksCsvSchema,
} from '../utils/schemas.js';
import * as ctrl from '../controllers/grading/gradingController.js';

const router = express.Router();
const admin = requireRole('SCHOOL_ADMIN');
const staff = requireRole('SCHOOL_ADMIN', 'TEACHER');

router.use(requireTenant, staff);

// Phase 1–2: grading scales & exam types
router.get('/grading-scales/active', ctrl.getActiveScale);
router.get('/grading-scales/profiles', admin, ctrl.listScaleProfiles);
router.post('/grading-scales', admin, validate(createGradingScaleProfileSchema), ctrl.createScaleProfile);
router.put('/grading-scales/:id/activate', admin, ctrl.activateScale);
router.get('/grading-scales/preview', ctrl.previewGrade);

router.get('/exam-types', ctrl.listExamTypes);
router.get('/terms/:termId/assessment-weights', ctrl.getTermWeights);
router.put('/terms/:termId/assessment-weights', admin, validate(termAssessmentWeightsSchema), ctrl.setTermWeights);

// Phase 3: schedule conflicts
router.get('/exam-schedules/conflicts', admin, validateQuery(scheduleConflictQuerySchema), ctrl.checkConflicts);

// Phase 5: mark review workflow
router.get(
  '/mark-entry/exam/:examId/schedules/:scheduleId/progress',
  staff,
  ctrl.markEntryProgress
);
router.get('/mark-review/exam/:examId', admin, ctrl.markReviewOverview);
router.get('/mark-review/exam/:examId/readiness', admin, ctrl.markReviewReadiness);
router.post('/mark-review/exam/:examId/lock-all', admin, ctrl.lockExamMarks);
router.post(
  '/mark-review/exam/:examId/schedules/:scheduleId/submit',
  staff,
  ctrl.submitMarksGroup
);
router.post(
  '/mark-review/exam/:examId/schedules/:scheduleId/verify',
  admin,
  ctrl.verifyMarksGroup
);
router.post(
  '/mark-review/exam/:examId/schedules/:scheduleId/reject',
  admin,
  validate(rejectMarksSchema),
  ctrl.rejectMarksGroup
);

// Phase 4: bulk CSV marks (mirrors exam mark sheet paths)
router.post(
  '/mark-entry/exam/:examId/schedules/:scheduleId/bulk-preview',
  staff,
  validate(bulkMarksCsvSchema),
  ctrl.bulkMarksPreview
);
router.post(
  '/mark-entry/exam/:examId/schedules/:scheduleId/bulk-commit',
  staff,
  validate(bulkMarksCsvSchema),
  ctrl.bulkMarksCommit
);

// Phase 6–7: computation + computed results
router.get('/computation-runs/:runId', admin, ctrl.getComputationRun);
router.post('/computation-runs/process', admin, ctrl.processComputationQueue);
router.get('/results/exam/:examId', validateQuery(paginationSchema), ctrl.listComputedResults);

export default router;
