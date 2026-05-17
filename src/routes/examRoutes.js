import express from 'express';
import { requireTenant, requireRole } from '../middlewares/authMiddleware.js';
import { validate, validateQuery } from '../middlewares/validate.js';
import { paginationSchema } from '../utils/pagination.js';
import { createExamBodySchema } from '../utils/schemas.js';
import * as ctrl from '../controllers/academic/examController.js';

const router = express.Router();
router.use(requireTenant, requireRole('SCHOOL_ADMIN', 'TEACHER'));

router.get('/', validateQuery(paginationSchema), ctrl.list);
router.get('/:id', ctrl.getOne);
router.get('/:id/results', validateQuery(paginationSchema), ctrl.getResults);
router.post('/', requireRole('SCHOOL_ADMIN'), validate(createExamBodySchema), ctrl.create);
export default router;
