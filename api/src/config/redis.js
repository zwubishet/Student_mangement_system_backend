import { createClient } from 'redis';
import { config } from './index.js';

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: false,
  },
});

redisClient.on('error', (err) => {
  if (process.env.NODE_ENV !== 'test') {
    console.error('Redis Client Error', err.message);
  }
});

await redisClient.connect().catch((err) => {
  console.warn(`Redis unavailable: ${err.message}. Token blacklist checks will be skipped.`);
});

export default redisClient;
