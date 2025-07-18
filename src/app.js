import express from 'express';
import AuthRoute from '../route/AuthinticationRoute.js';
import ProfileRoute from '../route/profileViewRoute.js'
import ResourceRoute from '../route/ResourceRoute.js';
import AnnouncementRoutes from '../route/AnnouncementRoute.js'
import GradeRoutes from '../route/GradingRoute.js'
import CommunityRoutes from '../route/communityRoute.js'

const app = express();

app.use(express.json());

app.use('/api/auth', AuthRoute);
app.use('/api/user', ProfileRoute);
app.use('/api/resource', ResourceRoute);
app.use('/api/announcement', AnnouncementRoutes);
app.use('/api/grade', GradeRoutes)
app.use('/api/community', CommunityRoutes)
export default app;