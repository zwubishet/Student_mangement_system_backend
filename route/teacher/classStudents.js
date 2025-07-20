import express from 'express';
import studentAssigned from '../../controller/teacher/getAsignedStudent.js';


const ClassStudentRoutes = express.Router();
ClassStudentRoutes.get("/", studentAssigned)

export default ClassStudentRoutes;