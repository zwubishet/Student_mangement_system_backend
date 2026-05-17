import pg from 'pg';
import { config } from './index.js';

const isNeonHost = (() => {
  try {
    return new URL(config.dbUrl).hostname.includes('neon.tech');
  } catch {
    return false;
  }
})();

const isPooledUrl = (() => {
  try {
    const url = new URL(config.dbUrl);
    return url.hostname.includes('-pooler.') || url.searchParams.get('pgbouncer') === 'true';
  } catch {
    return false;
  }
})();

const poolMax = Number(process.env.DB_POOL_MAX || (isPooledUrl ? 10 : isNeonHost ? 3 : 20));
const shouldUseSsl = process.env.DB_SSL === 'true' || (process.env.DB_SSL !== 'false' && isNeonHost);

const pool = new pg.Pool({
  connectionString: config.dbUrl,
  max: poolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: shouldUseSsl ? { rejectUnauthorized: false } : false,
});

// Helper for logging queries in development
export const query = (text, params) => {
  if (config.env === 'development') {
    console.log('[Database Query]:', text);
  }
  return pool.query(text, params);
};

export const getClient = () => pool.connect();

export const dbInfo = {
  isNeonHost,
  isPooledUrl,
  poolMax,
  shouldUseSsl,
};
