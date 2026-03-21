import express from 'express';
import { protectAction } from '../middlewares/authMiddleware.js';
import { createSubject } from '../controllers/academic/subjectController.js';



const router = express.Router();

// All academic routes are protected
router.use(protectAction);

router.post('/register-subject', createSubject);

export default router;