import express from 'express';
import { manageSchool } from '../../controller/school/schoolController.js';
// middleware comes from the controller auth module, not the routes directory
import { authenticateToken, requireRole } from '../../controller/auth/index.js';

const router = express.Router();

// only super admin may perform any school mutation
router.post(
  '/action/manageSchool',
  authenticateToken,
  requireRole(['SUPER_ADMIN']),
  manageSchool
);


export default router;
