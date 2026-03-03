import express from 'express';
import {
  login,
  register,
  refreshToken,
  logout,
} from '../controller/auth/index.js';

const router = express.Router();

// public authentication endpoints
router.post('/login', login);
router.post('/register', register);
router.post('/refresh', refreshToken);
router.post('/logout', logout);

export default router;