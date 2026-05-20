import express from 'express';
import { requireTenant, requireRole } from '../middlewares/authMiddleware.js';
import * as ctrl from '../controllers/academic/parentController.js';

const router = express.Router();
router.use(requireTenant, requireRole('SCHOOL_ADMIN'));

router.get('/', ctrl.list);
router.get('/search', ctrl.searchParents);
router.get('/search-students', ctrl.searchStudents);
router.post('/register', ctrl.register);
router.post('/:id/link-students', ctrl.linkStudents);
router.get('/by-student/:id', ctrl.studentParents);

export default router;
