import express from 'express';
import { requireTenant, requireRole } from '../middlewares/authMiddleware.js';
import { validate, validateQuery } from '../middlewares/validate.js';
import { updateSchoolSettingsSchema, createGradeScaleSchema } from '../utils/schemas.js';
import { paginationSchema } from '../utils/pagination.js';
import * as ctrl from '../controllers/settings/settingsController.js';

const router = express.Router();
router.use(requireTenant, requireRole('SCHOOL_ADMIN'));

router.get('/', ctrl.getSettings);
router.patch('/', validate(updateSchoolSettingsSchema), ctrl.updateSettings);

router.get('/grade-scales', ctrl.listGradeScales);
router.post('/grade-scales', validate(createGradeScaleSchema), ctrl.createGradeScale);
router.delete('/grade-scales/:id', ctrl.deleteGradeScale);

router.get('/users', validateQuery(paginationSchema), ctrl.listUsers);
router.patch('/users/:id/toggle-status', ctrl.toggleUserStatus);
export default router;
