import express from 'express';
import { requireTenant, requireRole } from '../middlewares/authMiddleware.js';
import { validate, validateQuery } from '../middlewares/validate.js';
import { paginationSchema } from '../utils/pagination.js';
import { createTeacherBodySchema, updateTeacherBodySchema } from '../utils/schemas.js';
import * as ctrl from '../controllers/academic/teacherController.js';

const router = express.Router();
router.use(requireTenant, requireRole('SCHOOL_ADMIN'));

router.get('/stats', ctrl.stats);
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

export default router;
