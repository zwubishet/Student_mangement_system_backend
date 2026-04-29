import express from 'express';
import { markAttendance, getAttendance } from '../controllers/operation/attendanceController.js';
import { protectAction } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/mark', protectAction, markAttendance);
router.post('/get', protectAction, getAttendance);

export default router;
