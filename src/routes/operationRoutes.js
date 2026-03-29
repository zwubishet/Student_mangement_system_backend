import express from "express";
import { handleCreateAnnouncementAction } from "../controllers/operation/createAnnouncement.js";
import { protectAction } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post('/announcements', protectAction, handleCreateAnnouncementAction);

export default router;