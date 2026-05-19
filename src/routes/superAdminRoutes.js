import express from 'express';
import { restrictBlacklisted, requirePlatformAdmin } from '../middlewares/authMiddleware.js';
import { validate } from '../middlewares/validate.js';
import { updateSchoolStatusSchema } from '../utils/schemas.js';
import * as ctrl from '../controllers/admin/superAdminController.js';

const router = express.Router();

router.use(restrictBlacklisted, requirePlatformAdmin);

/** @deprecated Use /api/v1/platform/* */
router.get('/schools', ctrl.listSchoolsLegacy);
router.post('/schools/status', validate(updateSchoolStatusSchema), ctrl.updateSchoolStatus);

export default router;
