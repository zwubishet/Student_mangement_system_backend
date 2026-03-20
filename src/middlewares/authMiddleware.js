import redisClient from '../config/redis.js';
import AppError from '../util/appError.js';
import catchAsync from '../util/catchAsync.js';

export const restrictBlacklisted = catchAsync(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer')) {
    const token = authHeader.split(' ')[1];
    
    const isBlacklisted = await redisClient.get(`blacklist:${token}`);
    if (isBlacklisted) {
      return next(new AppError('Token is no longer valid. Please log in again.', 401));
    }
  }
  next();
});