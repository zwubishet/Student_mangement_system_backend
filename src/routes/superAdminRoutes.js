import express from 'express';
import { listSchools, toggleSchoolStatus } from '../controllers/admin/superAdminController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect);
router.get('/schools', listSchools);
router.post('/schools/status', toggleSchoolStatus);

export default router;
