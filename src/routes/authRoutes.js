import express from 'express';
import { registerSchool } from '../controller/auth/registerController.js';
import { login } from '../controller/auth/loginController.js';

const authrouter = express.Router();

authrouter.post('/register-school', registerSchool);
authrouter.post('/login', login);
authrouter.post('/logout', logout);

export default authrouter;