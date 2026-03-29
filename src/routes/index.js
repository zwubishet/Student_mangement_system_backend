import express from 'express';
import  authrouter from './authRoutes.js';
import academicRouter from './academicRoutes.js';
import studentRouter from './studentRoutes.js';
import teacherRouter from './teacherRoutes.js';
import subjectRouter from './subjectRoutes.js';
import operationRouter from './operationRoutes.js';


const mainRouter = express.Router();

// Import your route modules here
// Example:
// const studentsRouter = require('./students');
// const teachersRouter = require('./teachers');

// Use your route modules
// router.use('/students', studentsRouter);
// router.use('/teachers', teachersRouter);

mainRouter.use('/auth', authrouter);
mainRouter.use('/academic', academicRouter);
mainRouter.use('/students', studentRouter);
mainRouter.use('/teachers', teacherRouter);
mainRouter.use('/subjects', subjectRouter);
mainRouter.use('/operations', operationRouter);

export default mainRouter;