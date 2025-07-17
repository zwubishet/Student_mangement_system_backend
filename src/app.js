import express from 'express';
import AuthRoute from '../route/AuthinticationRoute.js';
import ProfileRoute from '../route/profileViewRoute.js'
import ResourceRoute from '../route/ResourceRoute.js';
import AnnouncementRoutes from '../route/AnnouncementRoute.js'

const app = express();

app.use(express.json());

app.use('/api/auth', AuthRoute);
app.use('/api/user', ProfileRoute);
app.use('/api/resource', ResourceRoute);
app.use('/api/announcement', AnnouncementRoutes);
export default app;