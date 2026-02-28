// ✅ Central export for all auth handlers
export { login, refreshToken, logout, register } from './login.js';
export { manageUsers } from './manage-users.js';

// JWT middleware for protected routes
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    req.user = decoded; // { userId, role, studentId/teacherId/etc }
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};

// Role-based authorization middleware
export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: `Role ${req.user?.role || 'none'} not authorized. Required: ${roles.join(', ')}` 
      });
    }
    next();
  };
};
