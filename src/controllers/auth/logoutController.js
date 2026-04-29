import redisClient from '../../config/redis.js';
import catchAsync from '../../utils/catchAsync.js';

export const logout = catchAsync(async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    // Blacklist token for 24h (matches JWT expiry)
    await redisClient.set(`blacklist:${token}`, '1', { EX: 86400 });
  }
  res.json({ message: 'Logged out successfully' });
});
