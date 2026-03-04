import express from 'express';
import { manageSchool } from '../../controller/school/schoolController.js';
import { authenticateToken, requireRole } from '../auth/index.js';

const router = express.Router();

// only super admin may perform any school mutation
router.post(
  '/action/manageSchool',
  authenticateToken,
  requireRole(['SUPER_ADMIN']),
  manageSchool
);

export default router;
