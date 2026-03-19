import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 4000,
  env: process.env.NODE_ENV,
  dbUrl: process.env.DATABASE_URL,
  jwtSecret: JSON.parse(process.env.HASURA_GRAPHQL_JWT_SECRET).key,
  jwtExpires: process.env.JWT_EXPIRES_IN,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379'
};