import express from 'express';
import { createAcademicYear } from '../controllers/academic/yearController.js';
import {createTerm} from "../controllers/academic/termController.js";
import { createGradeWithSections } from '../controllers/academic/gradeController.js';
import { createClassesBulk } from '../controllers/academic/classController.js';
import { registerAndEnrollStudent } from '../controllers/academic/studentController.js';
import { protect } from '../middlewares/authMiddleware.js';


const router = express.Router();

// All academic routes are protected
router.use(protect);

router.post('/years', createAcademicYear);
router.post('/terms', createTerm);
router.post('/grades-complex', createGradeWithSections);
router.post('/classes-bulk', createClassesBulk);
router.post('/students/register-enroll', registerAndEnrollStudent);

export default router;