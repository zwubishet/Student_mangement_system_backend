import express from 'express';
import  authrouter from './authRoutes.js';

const mainRouter = express.Router();

// Import your route modules here
// Example:
// const studentsRouter = require('./students');
// const teachersRouter = require('./teachers');

// Use your route modules
// router.use('/students', studentsRouter);
// router.use('/teachers', teachersRouter);

mainRouter.use('/auth', authrouter);

export default mainRouter;