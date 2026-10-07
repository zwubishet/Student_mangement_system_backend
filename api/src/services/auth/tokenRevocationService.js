import jwt from 'jsonwebtoken';
import redisClient from '../../config/redis.js';
import { TOKEN_BLACKLIST_FALLBACK_SEC } from '../../constants/auth.js';

const blacklistKey = (token) => `blacklist:${token}`;

const ttlForToken = (token) => {
  try {
    const decoded = jwt.decode(token);
    if (decoded?.exp) {
      return Math.max(decoded.exp - Math.floor(Date.now() / 1000), 1);
    }
  } catch {
    /* ignore */
  }
  return TOKEN_BLACKLIST_FALLBACK_SEC;
};

export const isTokenBlacklisted = async (token) => {
  if (!token || !redisClient.isOpen) return false;
  const hit = await redisClient.get(blacklistKey(token));
  return Boolean(hit);
};

export const revokeAccessToken = async (token) => {
  if (!token || !redisClient.isOpen) return false;
  const ttl = ttlForToken(token);
  await redisClient.set(blacklistKey(token), '1', { EX: ttl });
  return true;
};
