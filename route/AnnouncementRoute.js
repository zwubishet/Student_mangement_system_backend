import express from 'express';
import AnnouncementController from '../controller/AnnouncementController.js';
import AuthenticationMiddleware from '../middleware/AuthenticationMiddleware.js';


const AnnouncementRoutes = express.Router();
AnnouncementRoutes.get("/", AnnouncementController.PublicAnnouncements)
AnnouncementRoutes.get("/private",AuthenticationMiddleware ,AnnouncementController.privateAnnouncements)

export default AnnouncementRoutes;