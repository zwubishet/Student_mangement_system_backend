import express from 'express';
import { createSchool, listSchools } from '../controller/schoolController.js';
import { authenticateToken, requireRole } from '../controller/auth/index.js';

const router = express.Router();

// only super admin may create schools
router.post(
  '/create',
  authenticateToken,
  requireRole(['SUPER_ADMIN']),
  createSchool
);

// any authenticated user can list schools (or adjust per needs)
router.get(
  '/',
  authenticateToken,
  listSchools
);

export default router;
