import express from 'express';
import { requireTenant, requireRole } from '../middlewares/authMiddleware.js';
import { validate } from '../middlewares/validate.js';
import { createAcademicYearSchema, createTermSchema } from '../utils/schemas.js';
import * as ctrl from '../controllers/catalog/catalogController.js';

const router = express.Router();
router.use(requireTenant, requireRole('SCHOOL_ADMIN', 'TEACHER'));

router.get('/years', ctrl.getYears);
router.post('/years', requireRole('SCHOOL_ADMIN'), validate(createAcademicYearSchema), ctrl.createYear);
router.post('/terms', requireRole('SCHOOL_ADMIN'), validate(createTermSchema), ctrl.createTerm);
router.get('/terms', ctrl.getTerms);
router.get('/grades', ctrl.getGrades);
router.get('/sections', ctrl.getSections);
router.get('/subjects', ctrl.getSubjects);
router.get('/classes', ctrl.getClasses);

export default router;
