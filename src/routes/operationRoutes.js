import express from "express";
import { handleCreateAnnouncementAction } from "../controllers/operation/createAnnouncement.js";
import { protectAction } from "../middlewares/authMiddleware.js";
import { handleCreateScheduleSlot } from "../controllers/operation/createScheduleSlot.js";

const router = express.Router();

router.post('/announcements', protectAction, handleCreateAnnouncementAction);
router.post('/schedule-slots', protectAction, handleCreateScheduleSlot);

export default router;