import express from 'express';
import { requireTenant, requireRole } from '../middlewares/authMiddleware.js';
import * as ctrl from '../controllers/academic/parentController.js';

const router = express.Router();
router.use(requireTenant, requireRole('SCHOOL_ADMIN'));

router.get('/', ctrl.list);
router.get('/search', ctrl.searchParents);
router.get('/search-students', ctrl.searchStudents);
router.post('/register', ctrl.register);
router.get('/by-student/:id', ctrl.studentParents);
router.post('/link-to-student/:studentId', ctrl.linkToStudent);
router.get('/:id', ctrl.getOne);
router.patch('/:id', ctrl.update);
router.post('/:id/reset-password', ctrl.resetPassword);
router.post('/:id/link-students', ctrl.linkStudents);
router.delete('/:id/students/:studentId', ctrl.unlinkStudent);

export default router;
