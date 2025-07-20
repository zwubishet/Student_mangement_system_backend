import express from 'express';
import {login, refreshToken, logout} from "../controller/AuthinticationController.js";

const AuthRoute = express.Router();

AuthRoute.post("/login", login);
AuthRoute.post("/refreshtoken", refreshToken);
AuthRoute.post("/logout", logout);

export default AuthRoute;