import express from 'express';
import getData from '../../controller/director/getData.js'
import { authorizeRoles } from '../../middleware/RoleMiddleware.js';
import AuthenticationMiddleware from '../../middleware/AuthenticationMiddleware.js';
import putData from '../../controller/director/putData.js';


const GetDataRoutes = express.Router();
GetDataRoutes.get("/teachers",AuthenticationMiddleware, authorizeRoles("DIRECTOR") , getData.getTeachers)
GetDataRoutes.get("/students",AuthenticationMiddleware, authorizeRoles("DIRECTOR") , getData.getStudents)
GetDataRoutes.get("/classes",AuthenticationMiddleware, authorizeRoles("DIRECTOR") , getData.getClasses)
GetDataRoutes.get("/classes/:grade/:section",AuthenticationMiddleware, authorizeRoles("DIRECTOR") , getData.getSpecficClassesStudents)
GetDataRoutes.get("/resources",AuthenticationMiddleware, authorizeRoles("DIRECTOR") , getData.getResoures)
GetDataRoutes.get("/announcments",AuthenticationMiddleware, authorizeRoles("DIRECTOR") , getData.getAnnouncements)
GetDataRoutes.put("/announcments",AuthenticationMiddleware, authorizeRoles("DIRECTOR") , putData.putAnnouncements)
GetDataRoutes.put("/resources",AuthenticationMiddleware, authorizeRoles("DIRECTOR") , putData.putResoures)
GetDataRoutes.put("/updateAnnouncement",AuthenticationMiddleware, authorizeRoles("DIRECTOR") , putData.updateAnnouncement)
GetDataRoutes.delete("/announcement",AuthenticationMiddleware, authorizeRoles("DIRECTOR") , putData.deleteAnnouncement)

export default GetDataRoutes;