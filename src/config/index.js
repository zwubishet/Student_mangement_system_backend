import dotenv from 'dotenv';
dotenv.config();

function resolveJwtSecret() {
  if (process.env.ACCESS_TOKEN_SECRET) return process.env.ACCESS_TOKEN_SECRET;
  if (process.env.HASURA_GRAPHQL_JWT_SECRET) {
    return JSON.parse(process.env.HASURA_GRAPHQL_JWT_SECRET).key;
  }
  throw new Error('Set ACCESS_TOKEN_SECRET (or HASURA_GRAPHQL_JWT_SECRET) in environment.');
}

export const config = {
  port: process.env.PORT || 4000,
  env: process.env.NODE_ENV,
  dbUrl: process.env.DATABASE_URL,
  jwtSecret: resolveJwtSecret(),
  jwtExpires: process.env.JWT_EXPIRES_IN,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
};