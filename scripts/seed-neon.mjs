#!/usr/bin/env node
/**
 * Seed one school + SCHOOL_ADMIN on Neon (or any Postgres via DATABASE_URL).
 *
 * Usage:
 *   export DATABASE_URL='postgresql://...neon...?sslmode=require'
 *   export SEED_ADMIN_EMAIL='admin@demoschool.edu'
 *   export SEED_ADMIN_PASSWORD='DemoAdmin123!'
 *   node scripts/seed-neon.mjs
 */

import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import pg from 'pg';

dotenv.config();

const dbUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
if (!dbUrl) {
  console.error('Set DATABASE_URL or NEON_DATABASE_URL');
  process.exit(1);
}

const schoolName = process.env.SEED_SCHOOL_NAME || 'Demo Academy';
const schoolAddress = process.env.SEED_SCHOOL_ADDRESS || 'Addis Ababa, Ethiopia';
const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@demoschool.edu').toLowerCase().trim();
const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'DemoAdmin123!';
const firstName = process.env.SEED_ADMIN_FIRST_NAME || 'School';
const lastName = process.env.SEED_ADMIN_LAST_NAME || 'Admin';

const isNeon = dbUrl.includes('neon.tech');
const pool = new pg.Pool({
  connectionString: dbUrl,
  ssl: isNeon ? { rejectUnauthorized: false } : false,
});

const PLATFORM_ROLES = ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'];

async function ensurePlatformRoles(client) {
  for (const name of PLATFORM_ROLES) {
    await client.query(
      `INSERT INTO identity.roles (name, school_id)
       SELECT $1, NULL
       WHERE NOT EXISTS (
         SELECT 1 FROM identity.roles WHERE name = $1 AND school_id IS NULL
       )`,
      [name]
    );
  }
}

async function main() {
  const client = await pool.connect();
  try {
    const existing = await client.query(
      `SELECT u.id FROM identity.users u WHERE lower(u.email) = $1`,
      [adminEmail]
    );
    if (existing.rows[0]) {
      console.log('Admin already exists:', adminEmail);
      process.exit(0);
    }

    await client.query('BEGIN');
    await ensurePlatformRoles(client);

    const schoolRes = await client.query(
      `INSERT INTO tenancy.schools (name, school_address, status)
       VALUES ($1, $2, 'active') RETURNING id, name`,
      [schoolName, schoolAddress]
    );
    const schoolId = schoolRes.rows[0].id;

    await client.query(
      `INSERT INTO tenancy.school_settings (school_id, email, timezone)
       VALUES ($1, $2, 'Africa/Addis_Ababa')
       ON CONFLICT (school_id) DO UPDATE SET email = EXCLUDED.email`,
      [schoolId, adminEmail]
    );

    const hash = await bcrypt.hash(adminPassword, 12);
    const userRes = await client.query(
      `INSERT INTO identity.users (email, password_hash, school_id, first_name, last_name, status)
       VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
      [adminEmail, hash, schoolId, firstName, lastName]
    );
    const userId = userRes.rows[0].id;

    await client.query(
      `INSERT INTO identity.userroles (user_id, role_id)
       SELECT $1, id FROM identity.roles WHERE name = 'SCHOOL_ADMIN' AND school_id IS NULL LIMIT 1`,
      [userId]
    );

    await client.query('COMMIT');

    console.log('\nSeed complete.\n');
    console.log('  School:', schoolRes.rows[0].name);
    console.log('  School ID:', schoolId);
    console.log('  Admin email:', adminEmail);
    console.log('  Admin password:', adminPassword);
    console.log('\nUse these credentials on Vercel after deploy.\n');
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
