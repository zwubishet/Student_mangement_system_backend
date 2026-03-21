import express from 'express';
import { registerAndEnrollStudent } from '../controllers/academic/studentController.js';
import { protect } from '../middlewares/authMiddleware.js';


const router = express.Router();

// All academic routes are protected
router.use(protect);

router.post('/register-enroll', registerAndEnrollStudent);

export default router;