import { test } from 'node:test';
import assert from 'node:assert/strict';

test('validateEnv requires core vars', async () => {
  const prev = { ...process.env };
  try {
    process.env.DATABASE_URL = 'postgres://u:p@localhost/db';
    process.env.ACCESS_TOKEN_SECRET = 'dev_access_secret_min_32_characters_long';
    process.env.ACTION_SECRET = 'supersecret';
    process.env.NODE_ENV = 'development';
    const { validateEnv } = await import('../src/config/validateEnv.js');
    assert.doesNotThrow(() => validateEnv());
  } finally {
    process.env = prev;
  }
});

test('validateEnv rejects weak secrets in production', async () => {
  const prev = { ...process.env };
  try {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgres://u:p@localhost/db';
    process.env.ACCESS_TOKEN_SECRET = 'supersecret';
    process.env.ACTION_SECRET = 'supersecret';
    const { validateEnv } = await import('../src/config/validateEnv.js');
    assert.throws(() => validateEnv(), /ACCESS_TOKEN_SECRET must be at least 32/);
  } finally {
    process.env = prev;
  }
});
