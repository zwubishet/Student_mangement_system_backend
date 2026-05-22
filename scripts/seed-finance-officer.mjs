#!/usr/bin/env node
/**
 * Create a FINANCE officer for an existing school (local or Neon).
 *
 *   export DATABASE_URL=...
 *   export SEED_FINANCE_EMAIL=finance@demoschool.edu
 *   export SEED_FINANCE_PASSWORD=FinanceDemo123!
 *   export SEED_SCHOOL_ID=<uuid>   # optional; uses first active school if omitted
 *   node scripts/seed-finance-officer.mjs
 */

import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import pg from 'pg';

dotenv.config();

const dbUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
if (!dbUrl) {
  console.error('Set DATABASE_URL');
  process.exit(1);
}

const email = (process.env.SEED_FINANCE_EMAIL || 'finance@demoschool.edu').toLowerCase().trim();
const password = process.env.SEED_FINANCE_PASSWORD || 'FinanceDemo123!';
const firstName = process.env.SEED_FINANCE_FIRST_NAME || 'Finance';
const lastName = process.env.SEED_FINANCE_LAST_NAME || 'Officer';
const schoolIdEnv = process.env.SEED_SCHOOL_ID;

const pool = new pg.Pool({
  connectionString: dbUrl,
  ssl: dbUrl.includes('neon.tech') ? { rejectUnauthorized: false } : false,
});

async function main() {
  const client = await pool.connect();
  try {
    const exists = await client.query(
      `SELECT id FROM identity.users WHERE lower(email) = $1`,
      [email]
    );
    if (exists.rows[0]) {
      console.log('Finance user already exists:', email);
      process.exit(0);
    }

    let schoolId = schoolIdEnv;
    if (!schoolId) {
      const s = await client.query(
        `SELECT id, name FROM tenancy.schools
         WHERE COALESCE(is_deleted, false) = false
           AND id != '00000000-0000-0000-0000-000000000001'
         ORDER BY created_at ASC LIMIT 1`
      );
      if (!s.rows[0]) {
        console.error('No school found. Run seed-neon.mjs first or set SEED_SCHOOL_ID.');
        process.exit(1);
      }
      schoolId = s.rows[0].id;
      console.log('Using school:', s.rows[0].name, schoolId);
    }

    await client.query('BEGIN');

    await client.query(
      `INSERT INTO identity.roles (name, school_id)
       SELECT 'FINANCE', NULL
       WHERE NOT EXISTS (
         SELECT 1 FROM identity.roles WHERE name = 'FINANCE' AND school_id IS NULL
       )`
    );

    const hash = await bcrypt.hash(password, 12);
    const userRes = await client.query(
      `INSERT INTO identity.users (email, password_hash, school_id, first_name, last_name, status)
       VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
      [email, hash, schoolId, firstName, lastName]
    );

    await client.query(
      `INSERT INTO identity.userroles (user_id, role_id)
       SELECT $1, id FROM identity.roles WHERE name = 'FINANCE' AND school_id IS NULL LIMIT 1`,
      [userRes.rows[0].id]
    );

    await client.query('COMMIT');
    console.log('\nFinance officer created.');
    console.log('  Email:', email);
    console.log('  Password:', password);
    console.log('  Login → /finance/dashboard\n');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
