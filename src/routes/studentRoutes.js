import express from 'express';
import { requireTenant, requireRole } from '../middlewares/authMiddleware.js';
import { validate, validateQuery } from '../middlewares/validate.js';
import { paginationSchema } from '../utils/pagination.js';
import { enrollStudentBodySchema } from '../utils/schemas.js';
import * as ctrl from '../controllers/academic/studentController.js';

const router = express.Router();
router.use(requireTenant, requireRole('SCHOOL_ADMIN'));

router.get('/stats', ctrl.stats);
router.get('/export', validateQuery(paginationSchema), ctrl.exportCsv);
router.post('/bulk', ctrl.bulk);
router.post('/import', ctrl.importRows);
router.get('/tags', ctrl.listTags);
router.post('/tags', ctrl.createTag);

router.get('/', validateQuery(paginationSchema), ctrl.list);
router.post('/', validate(enrollStudentBodySchema), ctrl.create);

router.get('/:id', ctrl.getOne);
router.post('/:id/documents', ctrl.addDocument);
router.post('/:id/tags/:tagId', ctrl.assignTag);
router.delete('/:id/tags/:tagId', ctrl.removeTag);
router.patch('/:id', ctrl.update);
router.post('/:id/archive', ctrl.archive);
router.post('/:id/restore', ctrl.restore);
router.delete('/:id', ctrl.remove);
router.post('/:id/notes', ctrl.addNote);
router.post('/:id/guardians', ctrl.addGuardian);

export default router;
