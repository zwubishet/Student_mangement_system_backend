import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { globalErrorHandler } from './middlewares/errorMiddleware.js';
import AppError from './utils/appError.js';
import mainRouter from './routes/index.js';

const app = express();

// Security Middlewares
app.use(helmet()); // Sets various HTTP headers for security
app.use(cors());
app.use(express.json({ limit: '10kb' })); // Body parser

app.use('/api/v1', mainRouter);

// Placeholder Route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'active', timestamp: new Date().toISOString() });
});

app.get('/', (req, res, next) => {
  res.json({ message: 'Welcome to the Student Management System API' });
});

// Handle undefined routes
app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global Error Handler
app.use(globalErrorHandler);

export default app;