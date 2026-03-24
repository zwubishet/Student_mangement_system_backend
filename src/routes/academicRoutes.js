import express from 'express';
import { createAcademicYear } from '../controllers/academic/yearController.js';
import {createTerm} from "../controllers/academic/termController.js";
import { createGradeWithSections } from '../controllers/academic/gradeController.js';
import { createClassesBulk } from '../controllers/academic/classController.js';
import { registerAndEnrollStudent } from '../controllers/academic/studentController.js';
import { assignTeacher } from '../controllers/academic/assignTeacher.js';
import { protectAction } from '../middlewares/authMiddleware.js';
import {handleCreateExamAction} from '../controllers/academic/createExam.js'
import {handleSetupExamSubjectsAction} from '../controllers/academic/addExamSubjects.js';
import {handleSubmitExamResultsAction} from '../controllers/academic/examResult.js';


const router = express.Router();

router.post('/years', protectAction, createAcademicYear);
router.post('/terms', protectAction, createTerm);
router.post('/grades-complex', protectAction, createGradeWithSections);
router.post('/classes-bulk', protectAction, createClassesBulk);
router.post('/assign-teacher', protectAction, assignTeacher);
router.post('/students/register-enroll', protectAction, registerAndEnrollStudent);
router.post('/create-exam', protectAction, handleCreateExamAction )
router.post('/add-exam-subjects', protectAction, handleSetupExamSubjectsAction);
router.post('/submit-exam-results', protectAction, handleSubmitExamResultsAction);

export default router;




