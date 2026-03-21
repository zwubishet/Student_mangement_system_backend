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

// FOR HASURA ACTIONS ONLY
export const protectAction = catchAsync(async (req, res, next) => {
  const actionSecret = req.headers['x-hasura-action-secret'];
  
  // Debugging tip: console.log(actionSecret, process.env.ACTION_SECRET) 
  // if you keep getting unauthorized
  
  if (!actionSecret || actionSecret !== process.env.ACTION_SECRET) {
    return next(new AppError('Unauthorized: This endpoint only accepts requests from Hasura.', 401));
  }

  if (!req.body.session_variables) {
    return next(new AppError('Unauthorized: Missing session context.', 401));
  }

  next();
});

// FOR DIRECT EXPRESS API CALLS (Login, etc)
export const protect = catchAsync(async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) return next(new AppError('Not logged in.', 401));

  const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  const claims = decoded['https://hasura.io/jwt/claims'];
  
  req.user = {
    id: claims['x-hasura-user-id'],
    schoolId: claims['x-hasura-school-id'],
    role: claims['x-hasura-default-role']
  };
  next();
});