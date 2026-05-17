import express from 'express';
import {
  completeUpload,
  createUploadUrl,
  listFiles,
} from '../controllers/infrastructure/fileController.js';
import { requireRole, requireTenant } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(requireTenant);

router.get('/', requireRole('SCHOOL_ADMIN', 'SUPER_ADMIN', 'TEACHER'), listFiles);
router.post('/presign', requireRole('SCHOOL_ADMIN', 'SUPER_ADMIN', 'TEACHER'), createUploadUrl);
router.post('/complete', requireRole('SCHOOL_ADMIN', 'SUPER_ADMIN', 'TEACHER'), completeUpload);

export default router;
