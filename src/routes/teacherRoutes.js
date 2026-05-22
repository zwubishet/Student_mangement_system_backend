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
router.use(requireTenant);

const admin = requireRole('SCHOOL_ADMIN');
const staffHr = requireRole('SCHOOL_ADMIN', 'FINANCE');

router.get('/stats', admin, ctrl.stats);
router.get('/licences/expiring', admin, staffCtrl.expiringLicences);
router.get('/departments', admin, ctrl.departments);
router.get('/export', admin, validateQuery(paginationSchema), ctrl.exportCsv);
router.post('/bulk', admin, ctrl.bulk);
router.post('/import', admin, ctrl.importRows);

router.get('/', staffHr, validateQuery(paginationSchema), ctrl.list);
router.post('/', admin, validate(createTeacherBodySchema), ctrl.create);

router.get('/:id', staffHr, ctrl.getOne);
router.patch('/:id', staffHr, validate(updateTeacherBodySchema), ctrl.update);
router.post('/:id/archive', admin, ctrl.archive);
router.post('/:id/restore', admin, ctrl.restore);
router.delete('/:id', admin, ctrl.remove);
router.post('/:id/notes', admin, ctrl.addNote);
router.post('/:id/qualifications', admin, ctrl.addQualification);
router.post('/:id/documents', admin, ctrl.addDocument);
router.put('/:id/availability', admin, ctrl.setAvailability);

router.get('/:id/contracts', staffHr, staffCtrl.listContracts);
router.post('/:id/contracts', staffHr, validate(staffContractBodySchema), staffCtrl.createContract);
router.get('/:id/leave', staffHr, staffCtrl.listLeave);
router.post('/:id/leave', staffHr, validate(staffLeaveBodySchema), staffCtrl.createLeave);
router.patch('/:id/leave/:leaveId', staffHr, validate(staffLeaveStatusSchema), staffCtrl.updateLeaveStatus);
router.get('/:id/appraisals', admin, staffCtrl.listAppraisals);
router.post('/:id/appraisals', admin, validate(staffAppraisalBodySchema), staffCtrl.createAppraisal);
router.get('/:id/cpd', admin, staffCtrl.listCpd);
router.post('/:id/cpd', admin, validate(staffCpdBodySchema), staffCtrl.createCpd);
router.post('/:id/cpd/:cpdId/verify', admin, staffCtrl.verifyCpd);

export default router;
