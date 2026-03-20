import express from 'express';
import { registerSchool } from '../controllers/auth/registerController.js';
import { login } from '../controllers/auth/loginController.js';
import { logout } from '../controllers/auth/logoutController.js';

const authrouter = express.Router();

authrouter.post('/register-school', registerSchool);
authrouter.post('/login', login);
authrouter.post('/logout', logout);

export default authrouter;