import express from 'express';
import 'dotenv/config';  // loads .env automatically
import cors from 'cors';

// pull in our auth handlers and helpers
import authRouter from './src/routes/auth.js';
import schoolRouter from './src/routes/school.js';
import { manageUsers, authenticateToken, requireRole } from './src/controller/auth/index.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// mount router instead of individual routes
app.use('/auth', authRouter);
app.use('/school', schoolRouter);

// protected director action
app.post(
  '/action/manageUsers',
  authenticateToken,
  requireRole(['DIRECTOR']),
  manageUsers
);

// stick with 3000 for consistency with other documentation
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
