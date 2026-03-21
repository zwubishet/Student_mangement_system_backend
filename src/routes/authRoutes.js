import express from 'express';
import { registerSchool } from '../controllers/auth/registerController.js';
import { protectAction } from '../middlewares/authMiddleware.js';
import { login } from '../controllers/auth/loginController.js';
import { logout } from '../controllers/auth/logoutController.js';

const authrouter = express.Router();

authrouter.post('/register-school', protectAction, registerSchool);
authrouter.post('/login', protectAction, login);
authrouter.post('/logout', protectAction, logout);

export default authrouter;