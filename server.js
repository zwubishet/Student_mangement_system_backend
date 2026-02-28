import express from 'express';
import 'dotenv/config';  // ✅ Loads .env automatically
import cors from 'cors';
import { 
  login, 
  register, 
  refreshToken, 
  logout, 
  manageUsers, 
  authenticateToken, 
  requireRole 
} from './src/auth/index.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ✅ PUBLIC ROUTES
app.post('/auth/login', login);
app.post('/auth/register', register);
app.post('/auth/refresh', refreshToken);
app.post('/auth/logout', logout);

// ✅ PROTECTED ROUTES (Director only)
app.post('/action/manageUsers', 
  authenticateToken, 
  requireRole(['DIRECTOR']), 
  manageUsers
);

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
