const express = require('express');
import { authrouter } from './authRoutes.js';

const router = express.Router();

// Import your route modules here
// Example:
// const studentsRouter = require('./students');
// const teachersRouter = require('./teachers');

// Use your route modules
// router.use('/students', studentsRouter);
// router.use('/teachers', teachersRouter);

router.use('/auth', authrouter);

module.exports = router;