import express from 'express';
import GradeRoute from '../controller/gradeController.js';
import AuthenticationMiddleware from '../middleware/AuthenticationMiddleware.js';

const GradeRoutes = express.Router();

GradeRoutes.get('/:year/:semester', AuthenticationMiddleware, GradeRoute.YearlyStudentResult);
GradeRoutes.get('/:subject', AuthenticationMiddleware, GradeRoute.SubjectResult);
GradeRoutes.get('/', AuthenticationMiddleware, GradeRoute.StudentGrade);

export default GradeRoutes;
