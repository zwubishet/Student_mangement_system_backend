import redisClient from '../config/redis.js';
import jwt from 'jsonwebtoken';
import AppError from '../utils/appError.js';
import catchAsync from '../utils/catchAsync.js';

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

export const protect = catchAsync(async (req, res, next) => {
  // 1. Get token from header
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('You are not logged in. Please log in to get access.', 401));
  }
  
 const secret = process.env.ACCESS_TOKEN_SECRET;

 const decoded = jwt.verify(token, secret);

  // 3. Extract Hasura claims for high-scale multi-tenancy
  const claims = decoded['https://hasura.io/jwt/claims'];
  
  // Attach user info to request
  req.user = {
    id: claims['x-hasura-user-id'],
    schoolId: claims['x-hasura-school-id'],
    role: claims['x-hasura-default-role']
  };

  next();
});