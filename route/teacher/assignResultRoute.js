import express from 'express';
import assignResult from '../../controller/teacher/assignResultToStudent.js';


const StudentResultRoutes = express.Router();
StudentResultRoutes.put("/assign", assignResult)


export default StudentResultRoutes;