import express from 'express';
import profileView from '../controller/profileViewController.js';
import scheduleController from '../controller/scheduleController.js';
import AuthenticationMiddleware from '../middleware/AuthenticationMiddleware.js';
import { updateTeacherProfile } from '../controller/teacher/updateProfileController.js';
import { authorizeRoles } from '../middleware/RoleMiddleware.js';

const ProfileRoute = express.Router();
ProfileRoute.get("/profile", AuthenticationMiddleware, profileView)
ProfileRoute.put(
  "/profile",
  AuthenticationMiddleware,
  authorizeRoles("TEACHER"),
  updateTeacherProfile
);
ProfileRoute.get("/schedule", AuthenticationMiddleware, scheduleController.Schedules)
ProfileRoute.get("/schedule/today", AuthenticationMiddleware, scheduleController.todaySchedules)
export default ProfileRoute;