import express from 'express';
import { requireTenant, requireRole } from '../middlewares/authMiddleware.js';
import * as ctrl from '../controllers/academic/parentController.js';

const router = express.Router();
router.use(requireTenant, requireRole('SCHOOL_ADMIN'));

router.get('/', ctrl.list);
router.post('/register', ctrl.register);
router.get('/by-student/:id', ctrl.studentParents);

export default router;
