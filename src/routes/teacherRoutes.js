import express from 'express';
import { protectAction } from '../middlewares/authMiddleware.js';
import { createTeacher } from '../controllers/academic/teacherController.js';


const router = express.Router();

// All academic routes are protected
router.use(protectAction);

router.post('/register-teacher', createTeacher);

export default router;