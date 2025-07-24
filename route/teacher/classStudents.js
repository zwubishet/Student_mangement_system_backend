import express from 'express';
import studentAssigned from '../../controller/teacher/getAsignedStudent.js';
import { authorizeRoles } from '../../middleware/RoleMiddleware.js';

const ClassStudentRoutes = express.Router();
ClassStudentRoutes.get("/",authorizeRoles("TEACHER"), studentAssigned)

export default ClassStudentRoutes;