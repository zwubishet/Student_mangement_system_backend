import redisClient from '../../config/redis.js';
import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';
import catchAsync from '../../utils/catchAsync.js';
import AppError from '../../utils/appError.js';

export const logout = catchAsync(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer')) {
    return next(new AppError('No token provided', 400));
  }

  const token = authHeader.split(' ')[1];

  // 1. Decode token to get expiration (exp)
  const decoded = jwt.decode(token);
  if (!decoded || !decoded.exp) {
    return next(new AppError('Invalid token', 400));
  }

  // 2. Calculate remaining Time-To-Live (TTL) in seconds
  const currentTime = Math.floor(Date.now() / 1000);
  const ttl = decoded.exp - currentTime;

  if (ttl > 0) {
    // 3. Add token to Redis blacklist with the remaining TTL
    // Key format: blacklist:token_string
    await redisClient.setEx(`blacklist:${token}`, ttl, 'true');
  }

  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully'
  });
});