#!/usr/bin/env node
/**
 * Seed PROVIDER_ADMIN and SUPER_PROVIDER_ADMIN platform operators.
 *
 *   export DATABASE_URL='postgresql://...'
 *   export SEED_PROVIDER_EMAIL='provider@edumanage.io'
 *   export SEED_SUPER_PROVIDER_EMAIL='superprovider@edumanage.io'
 *   node scripts/seed-provider-admins.mjs
 */

import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import pg from 'pg';

dotenv.config();

const PLATFORM_SCHOOL_ID = '00000000-0000-0000-0000-000000000001';
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('Set DATABASE_URL');
  process.exit(1);
}

const providerEmail = (process.env.SEED_PROVIDER_EMAIL || 'provider@edumanage.io').toLowerCase().trim();
const superProviderEmail = (process.env.SEED_SUPER_PROVIDER_EMAIL || 'superprovider@edumanage.io').toLowerCase().trim();
const password = process.env.SEED_PROVIDER_PASSWORD || 'Provider123!';

const pool = new pg.Pool({
  connectionString: dbUrl,
  ssl: /sslmode=require|ssl=true/i.test(dbUrl) ? { rejectUnauthorized: false } : false,
});

async function ensureRole(client, name) {
  await client.query(
    `INSERT INTO identity.roles (name, school_id)
     SELECT $1, NULL
     WHERE NOT EXISTS (
       SELECT 1 FROM identity.roles WHERE name = $1 AND school_id IS NULL
     )`,
    [name]
  );
  const res = await client.query(
    `SELECT id FROM identity.roles WHERE name = $1 AND school_id IS NULL LIMIT 1`,
    [name]
  );
  return res.rows[0]?.id;
}

async function seedUser(client, { email, firstName, lastName, roleName, starterPoints }) {
  const existing = await client.query(`SELECT id FROM identity.users WHERE lower(email) = $1`, [email]);
  if (existing.rows[0]) {
    console.log(`  Already exists: ${email}`);
    return existing.rows[0].id;
  }

  const hash = await bcrypt.hash(password, 12);
  const userRes = await client.query(
    `INSERT INTO identity.users (email, password_hash, school_id, first_name, last_name, status)
     VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
    [email, hash, PLATFORM_SCHOOL_ID, firstName, lastName]
  );
  const userId = userRes.rows[0].id;
  const roleId = await ensureRole(client, roleName);

  await client.query(
    `INSERT INTO identity.userroles (user_id, role_id) VALUES ($1, $2)`,
    [userId, roleId]
  );

  if (starterPoints > 0) {
    await client.query(
      `INSERT INTO platform.provider_accounts (user_id, balance_points, lifetime_earned)
       VALUES ($1, $2, $2)
       ON CONFLICT (user_id) DO UPDATE
       SET balance_points = EXCLUDED.balance_points,
           lifetime_earned = EXCLUDED.lifetime_earned,
           updated_at = NOW()`,
      [userId, starterPoints]
    );
  }

  console.log(`  Created ${roleName}: ${email}`);
  return userId;
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO tenancy.schools (id, name, slug, school_address, status, plan)
       VALUES ($1, 'EduManage Platform', 'edumanage-platform', 'System', 'active', 'enterprise')
       ON CONFLICT (id) DO NOTHING`,
      [PLATFORM_SCHOOL_ID]
    );

    await ensureRole(client, 'PROVIDER_ADMIN');
    await ensureRole(client, 'SUPER_PROVIDER_ADMIN');

    await seedUser(client, {
      email: providerEmail,
      firstName: 'Provider',
      lastName: 'Admin',
      roleName: 'PROVIDER_ADMIN',
      starterPoints: 0,
    });

    await seedUser(client, {
      email: superProviderEmail,
      firstName: 'Super',
      lastName: 'Provider',
      roleName: 'SUPER_PROVIDER_ADMIN',
      starterPoints: 5000,
    });

    await client.query('COMMIT');
    console.log('\nProvider admins seeded.\n');
    console.log('  PROVIDER_ADMIN:', providerEmail, '/', password);
    console.log('  SUPER_PROVIDER_ADMIN:', superProviderEmail, '/', password, '(5000 starter points)');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
