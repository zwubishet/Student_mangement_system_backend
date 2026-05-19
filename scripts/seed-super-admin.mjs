#!/usr/bin/env node
/**
 * Seed platform SUPER_ADMIN operator (EduManage control plane).
 *
 *   export DATABASE_URL='postgresql://...'
 *   export SEED_SUPER_EMAIL='superadmin@edumanage.io'
 *   export SEED_SUPER_PASSWORD='SuperAdmin123!'
 *   node scripts/seed-super-admin.mjs
 */

import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import pg from 'pg';

dotenv.config();

const PLATFORM_SCHOOL_ID = '00000000-0000-0000-0000-000000000001';
const dbUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
if (!dbUrl) {
  console.error('Set DATABASE_URL');
  process.exit(1);
}

const email = (process.env.SEED_SUPER_EMAIL || 'superadmin@edumanage.io').toLowerCase().trim();
const password = process.env.SEED_SUPER_PASSWORD || 'SuperAdmin123!';
const firstName = process.env.SEED_SUPER_FIRST_NAME || 'Platform';
const lastName = process.env.SEED_SUPER_LAST_NAME || 'Admin';

const pool = new pg.Pool({
  connectionString: dbUrl,
  ssl: dbUrl.includes('neon.tech') ? { rejectUnauthorized: false } : false,
});

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO tenancy.schools (id, name, school_address, status, plan)
       VALUES ($1, 'EduManage Platform', 'System', 'active', 'platform')
       ON CONFLICT (id) DO NOTHING`,
      [PLATFORM_SCHOOL_ID]
    );

    await client.query(
      `INSERT INTO identity.roles (name, school_id)
       SELECT 'SUPER_ADMIN', NULL
       WHERE NOT EXISTS (
         SELECT 1 FROM identity.roles WHERE name = 'SUPER_ADMIN' AND school_id IS NULL
       )`
    );

    const existing = await client.query(
      `SELECT id FROM identity.users WHERE lower(email) = $1`,
      [email]
    );
    if (existing.rows[0]) {
      console.log('Super admin already exists:', email);
      await client.query('COMMIT');
      return;
    }

    const hash = await bcrypt.hash(password, 12);
    const userRes = await client.query(
      `INSERT INTO identity.users (email, password_hash, school_id, first_name, last_name, status)
       VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
      [email, hash, PLATFORM_SCHOOL_ID, firstName, lastName]
    );

    await client.query(
      `INSERT INTO identity.userroles (user_id, role_id)
       SELECT $1, id FROM identity.roles
       WHERE name = 'SUPER_ADMIN' AND school_id IS NULL LIMIT 1`,
      [userRes.rows[0].id]
    );

    await client.query('COMMIT');
    console.log('\nSuper admin seeded.\n');
    console.log('  Email:', email);
    console.log('  Password:', password);
    console.log('  Login → /super-admin/dashboard\n');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
