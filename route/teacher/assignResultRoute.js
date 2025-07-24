import express from 'express';
import assignResultToStudent from '../../controller/teacher/assignResultToStudent.js';
import { authorizeRoles } from '../../middleware/RoleMiddleware.js';

const StudentResultRoutes = express.Router();
StudentResultRoutes.put("/assign",authorizeRoles("TEACHER"), assignResultToStudent.assignResult)
StudentResultRoutes.put("/assign/:studentId",authorizeRoles("TEACHER"), assignResultToStudent.createYearSemester)
StudentResultRoutes.put("/semesterTotal/:studentId",authorizeRoles("TEACHER"), assignResultToStudent.workStudentSemsterResult)


export default StudentResultRoutes;