import express from 'express';
import 'dotenv/config';  // loads .env automatically
import cors from 'cors';

// pull in our auth handlers and helpers
import authRouter from './src/routes/auth.js';
import { manageUsers, authenticateToken, requireRole } from './src/controller/auth/index.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// mount router instead of individual routes
app.use('/auth', authRouter);

// protected director action
app.post(
  '/action/manageUsers',
  authenticateToken,
  requireRole(['DIRECTOR']),
  manageUsers
);

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
