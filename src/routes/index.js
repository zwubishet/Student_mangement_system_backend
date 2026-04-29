import express from 'express';
import authrouter from './authRoutes.js';
import academicRouter from './academicRoutes.js';
import studentRouter from './studentRoutes.js';
import teacherRouter from './teacherRoutes.js';
import subjectRouter from './subjectRoutes.js';
import operationRouter from './operationRoutes.js';
import attendanceRouter from './attendanceRoutes.js';
import superAdminRouter from './superAdminRoutes.js';

const mainRouter = express.Router();

mainRouter.use('/auth', authrouter);
mainRouter.use('/academic', academicRouter);
mainRouter.use('/students', studentRouter);
mainRouter.use('/teachers', teacherRouter);
mainRouter.use('/subjects', subjectRouter);
mainRouter.use('/operations', operationRouter);
mainRouter.use('/attendance', attendanceRouter);
mainRouter.use('/super-admin', superAdminRouter);

export default mainRouter;
