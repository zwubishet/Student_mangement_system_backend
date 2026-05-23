import express from 'express';
import { requireTenant, requireRole } from '../middlewares/authMiddleware.js';
import * as ctrl from '../controllers/library/physicalLibraryController.js';

const router = express.Router();
const admin = requireRole('SCHOOL_ADMIN');

router.use(requireTenant, admin);

router.get('/books', ctrl.listBooks);
router.post('/books', ctrl.createBook);
router.patch('/books/:id', ctrl.updateBook);
router.get('/borrowings', ctrl.activeBorrowings);
router.get('/overdue', ctrl.overdue);
router.post('/borrow', ctrl.borrow);
router.patch('/borrow/:id/return', ctrl.returnBorrowing);

export default router;
