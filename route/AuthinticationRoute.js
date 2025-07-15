import express from 'express';
import {login} from "../controller/AuthinticationController.js";

const AuthRoute = express.Router();

AuthRoute.post("/login", login);

export default AuthRoute;