import express from 'express';
import { requireTenant, requireRole } from '../middlewares/authMiddleware.js';
import * as ctrl from '../controllers/library/resourceController.js';

const router = express.Router();

const reader = requireRole('SCHOOL_ADMIN', 'TEACHER', 'FINANCE', 'PARENT', 'STUDENT');
const teacher = requireRole('TEACHER', 'SCHOOL_ADMIN');
const admin = requireRole('SCHOOL_ADMIN');
const uploader = requireRole('TEACHER', 'SCHOOL_ADMIN', 'SUPER_ADMIN');

router.use(requireTenant);

router.get('/overview', reader, ctrl.overview);
router.get('/categories', reader, ctrl.categories);

router.get('/share/my-sections', requireRole('TEACHER'), ctrl.shareMySections);
router.get('/section/:sectionId', reader, ctrl.sectionLibrary);

router.get('/', reader, ctrl.list);
router.post('/', uploader, ctrl.create);

router.delete('/shares/:shareId', teacher, ctrl.unshare);
router.patch('/shares/:shareId/pin', teacher, ctrl.pinShare);

router.get('/:id/access', reader, ctrl.access);
router.post('/:id/bookmark', reader, ctrl.bookmark);
router.get('/:id/shares', teacher, ctrl.listShares);
router.post('/:id/share', teacher, ctrl.share);
router.patch('/:id/review', admin, ctrl.review);
router.get('/:id', reader, ctrl.getOne);
router.delete('/:id', uploader, ctrl.remove);

export default router;
