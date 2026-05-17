import express from 'express';
import { requireTenant, requireRole } from '../middlewares/authMiddleware.js';
import { validate, validateQuery } from '../middlewares/validate.js';
import { paginationSchema } from '../utils/pagination.js';
import { createClassBodySchema, assignTeacherBodySchema } from '../utils/schemas.js';
import * as ctrl from '../controllers/academic/classController.js';

const router = express.Router();
router.use(requireTenant, requireRole('SCHOOL_ADMIN'));

router.get('/', validateQuery(paginationSchema), ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', validate(createClassBodySchema), ctrl.create);
router.post('/sections/:sectionId/assign-teacher', validate(assignTeacherBodySchema), ctrl.assignTeacher);
export default router;
