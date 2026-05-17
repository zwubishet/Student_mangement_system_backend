import express from 'express';
import { requireTenant, requireRole } from '../middlewares/authMiddleware.js';
import * as ctrl from '../controllers/catalog/catalogController.js';

const router = express.Router();
router.use(requireTenant, requireRole('SCHOOL_ADMIN', 'TEACHER'));

router.get('/years', ctrl.getYears);
router.get('/terms', ctrl.getTerms);
router.get('/grades', ctrl.getGrades);
router.get('/sections', ctrl.getSections);
router.get('/subjects', ctrl.getSubjects);
router.get('/classes', ctrl.getClasses);

export default router;
