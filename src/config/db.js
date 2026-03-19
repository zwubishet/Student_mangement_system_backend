import pg from 'pg';
import { config } from './index.js';

const pool = new pg.Pool({
  connectionString: config.dbUrl,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Helper for logging queries in development
export const query = (text, params) => {
  if (config.env === 'development') {
    console.log('[Database Query]:', text);
  }
  return pool.query(text, params);
};

export const getClient = () => pool.connect();