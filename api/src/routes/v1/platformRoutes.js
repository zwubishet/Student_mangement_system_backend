import express from 'express';
import { restrictBlacklisted, requirePlatformAccess, protectAction } from '../../middlewares/authMiddleware.js';
import { validate } from '../../middlewares/validate.js';
import {
  createSchoolSchema,
  updateSchoolSchema,
  updateSchoolStatusSchema,
  patchPlatformSettingsSchema,
  featureFlagsSchema,
} from '../../utils/schemas.js';
import * as ctrl from '../../controllers/admin/superAdminController.js';
import * as providerCtrl from '../../controllers/platform/providerPlatformController.js';

const router = express.Router();

router.use(restrictBlacklisted);

// Profile + point claims (all platform roles; writes gated in middleware)
router.get('/me', requirePlatformAccess, providerCtrl.getMe);
router.patch('/me', requirePlatformAccess, providerCtrl.patchMe);
router.get('/points/balance', requirePlatformAccess, providerCtrl.getPointBalance);
router.get('/point-claims', requirePlatformAccess, providerCtrl.listPointClaims);
router.post('/point-claims', requirePlatformAccess, providerCtrl.createPointClaim);
router.patch('/point-claims/:id/review', requirePlatformAccess, providerCtrl.reviewPointClaim);
router.post('/point-claims/:id/cancel', requirePlatformAccess, providerCtrl.cancelPointClaim);

router.get('/health', requirePlatformAccess, ctrl.getHealth);
router.get('/overview', requirePlatformAccess, ctrl.getOverview);
router.get('/finance/overview', requirePlatformAccess, ctrl.getPlatformFinance);
router.get('/finance/transactions', requirePlatformAccess, ctrl.getPlatformFinanceTransactions);
router.get('/finance/commissions', requirePlatformAccess, ctrl.getPlatformFinanceCommissions);
router.get('/finance/billing', requirePlatformAccess, ctrl.getPlatformFinanceBilling);
router.post('/schools/:schoolId/finance-officers', requirePlatformAccess, ctrl.createPlatformFinanceOfficer);

router.get('/users', requirePlatformAccess, ctrl.listUsers);
router.get('/students', requirePlatformAccess, ctrl.listStudents);
router.get('/teachers', requirePlatformAccess, ctrl.listTeachers);
router.get('/activity', requirePlatformAccess, ctrl.getActivity);

router.get('/schools', requirePlatformAccess, ctrl.listSchools);
router.get('/schools/:id/summary', requirePlatformAccess, ctrl.getSchoolSummary);
router.get('/schools/:id', requirePlatformAccess, ctrl.getSchool);
router.post('/schools', requirePlatformAccess, validate(createSchoolSchema), ctrl.createSchool);
router.patch('/schools/:id', requirePlatformAccess, validate(updateSchoolSchema), ctrl.updateSchool);
router.post('/schools/status', requirePlatformAccess, validate(updateSchoolStatusSchema), ctrl.updateSchoolStatus);

router.get('/subscriptions', requirePlatformAccess, ctrl.listSubscriptions);
router.get('/audit/platform', requirePlatformAccess, ctrl.listPlatformAudit);
router.get('/audit/tenants', requirePlatformAccess, ctrl.listTenantAudit);

router.get('/settings', requirePlatformAccess, ctrl.getSettings);
router.patch('/settings', requirePlatformAccess, validate(patchPlatformSettingsSchema), ctrl.patchSettings);

router.get('/schools/:id/features', requirePlatformAccess, ctrl.getFeatureFlags);
router.put('/schools/:id/features', requirePlatformAccess, validate(featureFlagsSchema), ctrl.putFeatureFlags);

/** Hasura synchronous action */
router.post(
  '/actions/school-status',
  protectAction,
  ctrl.updateSchoolStatus
);

export default router;
