import express from 'express';
import { restrictBlacklisted, requirePlatformAdmin, protectAction } from '../middlewares/authMiddleware.js';
import { validate } from '../middlewares/validate.js';
import {
  createSchoolSchema,
  updateSchoolSchema,
  updateSchoolStatusSchema,
  patchPlatformSettingsSchema,
  featureFlagsSchema,
} from '../utils/schemas.js';
import * as ctrl from '../controllers/admin/superAdminController.js';

const router = express.Router();

router.use(restrictBlacklisted);

router.get('/health', requirePlatformAdmin, ctrl.getHealth);
router.get('/overview', requirePlatformAdmin, ctrl.getOverview);
router.get('/finance/overview', requirePlatformAdmin, ctrl.getPlatformFinance);
router.get('/finance/transactions', requirePlatformAdmin, ctrl.getPlatformFinanceTransactions);
router.get('/finance/commissions', requirePlatformAdmin, ctrl.getPlatformFinanceCommissions);
router.get('/finance/billing', requirePlatformAdmin, ctrl.getPlatformFinanceBilling);
router.post('/schools/:schoolId/finance-officers', requirePlatformAdmin, ctrl.createPlatformFinanceOfficer);

router.get('/users', requirePlatformAdmin, ctrl.listUsers);
router.get('/students', requirePlatformAdmin, ctrl.listStudents);
router.get('/teachers', requirePlatformAdmin, ctrl.listTeachers);
router.get('/activity', requirePlatformAdmin, ctrl.getActivity);

router.get('/schools', requirePlatformAdmin, ctrl.listSchools);
router.get('/schools/:id/summary', requirePlatformAdmin, ctrl.getSchoolSummary);
router.get('/schools/:id', requirePlatformAdmin, ctrl.getSchool);
router.post('/schools', requirePlatformAdmin, validate(createSchoolSchema), ctrl.createSchool);
router.patch('/schools/:id', requirePlatformAdmin, validate(updateSchoolSchema), ctrl.updateSchool);
router.post('/schools/status', requirePlatformAdmin, validate(updateSchoolStatusSchema), ctrl.updateSchoolStatus);

router.get('/subscriptions', requirePlatformAdmin, ctrl.listSubscriptions);
router.get('/audit/platform', requirePlatformAdmin, ctrl.listPlatformAudit);
router.get('/audit/tenants', requirePlatformAdmin, ctrl.listTenantAudit);

router.get('/settings', requirePlatformAdmin, ctrl.getSettings);
router.patch('/settings', requirePlatformAdmin, validate(patchPlatformSettingsSchema), ctrl.patchSettings);

router.get('/schools/:id/features', requirePlatformAdmin, ctrl.getFeatureFlags);
router.put('/schools/:id/features', requirePlatformAdmin, validate(featureFlagsSchema), ctrl.putFeatureFlags);

/** Hasura synchronous action */
router.post(
  '/actions/school-status',
  protectAction,
  ctrl.updateSchoolStatus
);

export default router;
