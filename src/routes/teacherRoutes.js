import express from 'express';
import { requireTenant, requireRole } from '../middlewares/authMiddleware.js';
import { validate, validateQuery } from '../middlewares/validate.js';
import { paginationSchema } from '../utils/pagination.js';
import {
  createTeacherBodySchema,
  updateTeacherBodySchema,
  staffContractBodySchema,
  staffLeaveBodySchema,
  staffLeaveStatusSchema,
  staffAppraisalBodySchema,
  staffCpdBodySchema,
} from '../utils/schemas.js';
import * as ctrl from '../controllers/academic/teacherController.js';
import * as staffCtrl from '../controllers/academic/staffController.js';

const router = express.Router();
router.use(requireTenant, requireRole('SCHOOL_ADMIN'));

router.get('/stats', ctrl.stats);
router.get('/licences/expiring', staffCtrl.expiringLicences);
router.get('/departments', ctrl.departments);
router.get('/export', validateQuery(paginationSchema), ctrl.exportCsv);
router.post('/bulk', ctrl.bulk);
router.post('/import', ctrl.importRows);

router.get('/', validateQuery(paginationSchema), ctrl.list);
router.post('/', validate(createTeacherBodySchema), ctrl.create);

router.get('/:id', ctrl.getOne);
router.patch('/:id', validate(updateTeacherBodySchema), ctrl.update);
router.post('/:id/archive', ctrl.archive);
router.post('/:id/restore', ctrl.restore);
router.delete('/:id', ctrl.remove);
router.post('/:id/notes', ctrl.addNote);
router.post('/:id/qualifications', ctrl.addQualification);
router.post('/:id/documents', ctrl.addDocument);
router.put('/:id/availability', ctrl.setAvailability);

router.get('/:id/contracts', staffCtrl.listContracts);
router.post('/:id/contracts', validate(staffContractBodySchema), staffCtrl.createContract);
router.get('/:id/leave', staffCtrl.listLeave);
router.post('/:id/leave', validate(staffLeaveBodySchema), staffCtrl.createLeave);
router.patch('/:id/leave/:leaveId', validate(staffLeaveStatusSchema), staffCtrl.updateLeaveStatus);
router.get('/:id/appraisals', staffCtrl.listAppraisals);
router.post('/:id/appraisals', validate(staffAppraisalBodySchema), staffCtrl.createAppraisal);
router.get('/:id/cpd', staffCtrl.listCpd);
router.post('/:id/cpd', validate(staffCpdBodySchema), staffCtrl.createCpd);
router.post('/:id/cpd/:cpdId/verify', staffCtrl.verifyCpd);

export default router;
