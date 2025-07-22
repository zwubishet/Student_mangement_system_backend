import express from 'express';
import cors from 'cors'; // or const cors = require('cors');
import AuthRoute from '../route/AuthinticationRoute.js';
import ProfileRoute from '../route/profileViewRoute.js'
import ResourceRoute from '../route/ResourceRoute.js';
import AnnouncementRoutes from '../route/AnnouncementRoute.js'
import GradeRoutes from '../route/GradingRoute.js'
import CommunityRoutes from '../route/communityRoute.js'
import ClassStudentRoutes from '../route/teacher/classStudents.js';
import StudentResultRoutes from '../route/teacher/assignResultRoute.js';
import GetDataRoutes from '../route/director/dataGetRoute.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', AuthRoute);
app.use('/api/user', ProfileRoute);
app.use('/api/resource', ResourceRoute);
app.use('/api/announcement', AnnouncementRoutes);
app.use('/api/grade', GradeRoutes)
app.use('/api/community', CommunityRoutes)
app.use('/api/class', ClassStudentRoutes)
app.use('/api/result', StudentResultRoutes)
app.use('/api/director', GetDataRoutes)

export default app;