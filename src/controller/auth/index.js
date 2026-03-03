// src/auth/index.js - COMPLETE & FIXED
import jwt from 'jsonwebtoken';  // ✅ ADD THIS IMPORT!
import { login } from './login.js';
import { refreshToken } from './refresh_token.js';
import { logout } from './logout.js';
import { register } from './register.js';
import { manageUsers } from './manage-users.js';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    req.user = decoded; // ✅ Works with your token!
    next();
  } catch (err) {
    console.log('Token verification failed:', err.message); // ✅ Debug log
    return res.status(403).json({ message: 'Invalid token' });
  }
};

export const requireRole = (roles) => {
  return (req, res, next) => {
    console.log('User role check:', req.user?.role, 'Required:', roles); // ✅ Debug
    if (!req.user || !roles.map(r => r.toLowerCase()).includes(req.user.role.toLowerCase())) {
      return res.status(403).json({ 
        message: `Role ${req.user?.role || 'none'} not authorized. Required: ${roles.join(', ')}` 
      });
    }
    next();
  };
};

// Export all handlers
export { login, refreshToken, logout, register, manageUsers };
