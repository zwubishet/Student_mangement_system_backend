import pg from 'pg';
import { config } from './index.js';

const connectionString = config.dbUrl || '';

const isPooledUrl = (() => {
  try {
    const url = new URL(connectionString);
    return url.hostname.includes('-pooler.') || url.searchParams.get('pgbouncer') === 'true';
  } catch {
    return false;
  }
})();

const shouldUseSsl =
  process.env.DB_SSL === 'true' ||
  (process.env.DB_SSL !== 'false' && /sslmode=require|ssl=true/i.test(connectionString));

const poolMax = Number(process.env.DB_POOL_MAX || (isPooledUrl ? 10 : shouldUseSsl ? 8 : 20));

const pool = new pg.Pool({
  connectionString: config.dbUrl,
  max: poolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: shouldUseSsl ? { rejectUnauthorized: false } : false,
});

export const query = (text, params) => {
  if (config.env === 'development') {
    console.log('[Database Query]:', text);
  }
  return pool.query(text, params);
};

export const getClient = () => pool.connect();

export const dbInfo = {
  isPooledUrl,
  poolMax,
  shouldUseSsl,
};
