import express from 'express';
import { registerSchool } from '../controllers/auth/registerController.js';
import { protectAction, restrictBlacklisted } from '../middlewares/authMiddleware.js';
import { login, loginSession } from '../controllers/auth/loginController.js';
import { logout } from '../controllers/auth/logoutController.js';
import { validate } from '../middlewares/validate.js';
import { loginSchema } from '../utils/validators.js';

const authrouter = express.Router();

authrouter.post('/session', validate(loginSchema), loginSession);
authrouter.post('/register-school', protectAction, registerSchool);
authrouter.post('/login', protectAction, login);
authrouter.post('/logout', restrictBlacklisted, logout);

export default authrouter;