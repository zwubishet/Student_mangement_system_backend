import express from 'express';
import profileView from '../controller/profileViewContriller.js';
import scheduleController from '../controller/scheduleController.js';
import AuthenticationMiddleware from '../middleware/AuthenticationMiddleware.js';

const ProfileRoute = express.Router();
ProfileRoute.get("/profile", AuthenticationMiddleware, profileView)
ProfileRoute.get("/schedule", AuthenticationMiddleware, scheduleController.Schedules)
ProfileRoute.get("/schedule/today", AuthenticationMiddleware, scheduleController.todaySchedules)
export default ProfileRoute;