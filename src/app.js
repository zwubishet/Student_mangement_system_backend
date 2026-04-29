import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { globalErrorHandler } from './middlewares/errorMiddleware.js';
import AppError from './utils/appError.js';
import mainRouter from './routes/index.js';

// Validate required env vars on startup
const required = ['DATABASE_URL', 'ACCESS_TOKEN_SECRET', 'ACTION_SECRET'];
required.forEach((key) => {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
});

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '10kb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Stricter limit on auth endpoints
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/api/v1/auth', authLimiter);

app.use('/api/v1', mainRouter);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'active', timestamp: new Date().toISOString() });
});

app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

export default app;
