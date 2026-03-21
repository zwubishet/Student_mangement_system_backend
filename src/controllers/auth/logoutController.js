import redisClient from '../../config/redis.js';
import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';

export const logout = catchAsync(async (req, res, next) => {
  // 1. Get token from forwarded headers
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer')) {
    return next(new AppError('No token provided to blacklist.', 400));
  }

  const token = authHeader.split(' ')[1];

  // 2. Decode to find out when this token was supposed to die
  const decoded = jwt.decode(token);
  if (!decoded || !decoded.exp) {
    return next(new AppError('Invalid token format.', 400));
  }

  // 3. Calculate seconds until natural expiration
  const ttl = decoded.exp - Math.floor(Date.now() / 1000);

  if (ttl > 0) {
    // 4. Blacklist it in Redis for exactly that long
    await redisClient.setEx(`blacklist:${token}`, ttl, 'true');
  }

  res.json({
    status: 'success',
    message: 'Logged out successfully'
  });
});