import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { globalErrorHandler } from './middlewares/errorMiddleware.js';
import { AppError } from './utils/errors.js';
import mainRouter from './routes/index.js';
import { restrictBlacklisted } from './middlewares/authMiddleware.js';
import { requestLogger } from './middlewares/requestLogger.js';
import { resolveCorsOptions } from './utils/corsOrigins.js';

const required = ['DATABASE_URL', 'ACCESS_TOKEN_SECRET', 'ACTION_SECRET'];
required.forEach((key) => {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
});

const app = express();

app.use(helmet());
app.use(cors(resolveCorsOptions()));
app.use(express.json({ limit: '8mb' }));

const apiRateMax = process.env.NODE_ENV === 'development' ? 5000 : 500;
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: apiRateMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);
app.use('/api/v1/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));

app.use('/api/v1', restrictBlacklisted, requestLogger, mainRouter);

/** Deploy sanity check — hit /api/v1/meta to confirm lesson-plans & resources are live */
app.get('/api/v1/meta', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'sms-api',
    version: process.env.npm_package_version || '1.0.0',
    modules: [
      'auth', 'catalog', 'students', 'teachers', 'lesson-plans', 'resources', 'library', 'finance', 'chapa-payments', 'grading',
    ],
  });
});

app.get('/health', (req, res) => res.status(200).json({
  status: 'active',
  timestamp: new Date().toISOString(),
  modules: ['lesson-plans', 'resources', 'library'],
}));

app.all('*', (req, res, next) => next(new AppError(`Route ${req.originalUrl} not found`, 404)));

app.use(globalErrorHandler);

export default app;
