import express from 'express';
import {
  completeUpload,
  createUploadUrl,
  listFiles,
  uploadLocal,
  serveFile,
  removeFile,
} from '../controllers/infrastructure/fileController.js';
import { requireRole, requireTenant } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/serve/*', serveFile);

router.use(requireTenant);

router.get('/', requireRole('SCHOOL_ADMIN', 'SUPER_ADMIN', 'TEACHER'), listFiles);
router.post('/presign', requireRole('SCHOOL_ADMIN', 'SUPER_ADMIN', 'TEACHER'), createUploadUrl);
router.post('/upload-local', requireRole('SCHOOL_ADMIN', 'SUPER_ADMIN', 'TEACHER'), express.json({ limit: '30mb' }), uploadLocal);
router.post('/complete', requireRole('SCHOOL_ADMIN', 'SUPER_ADMIN', 'TEACHER'), completeUpload);
router.delete('/:id', requireRole('SCHOOL_ADMIN', 'SUPER_ADMIN'), removeFile);

export default router;
