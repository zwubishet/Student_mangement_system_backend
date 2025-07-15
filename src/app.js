import express from 'express';
import AuthRoute from '../route/AuthinticationRoute.js';

const app = express();

app.use(express.json());

app.use('/api/auth', AuthRoute);

export default app;