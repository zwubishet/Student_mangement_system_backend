#!/usr/bin/env node
/**
 * Bootstrap fee categories, per-grade schedules, and mandatory subscriptions
 * for the demo school (or first school in DB).
 *
 * Usage: node scripts/seed-fee-billing.mjs
 *        node scripts/seed-fee-billing.mjs --year=2025/2026 --term=1
 */
import pg from 'pg';
import { bootstrapSchoolFeeBilling } from '../src/services/finance/studentFeeService.js';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const yearArg = process.argv.find((a) => a.startsWith('--year='))?.split('=')[1];
const termArg = Number(process.argv.find((a) => a.startsWith('--term='))?.split('=')[1] || 1);

async function main() {
  const client = await pool.connect();
  try {
    const school = await client.query(
      `SELECT s.id, s.name, COUNT(se.id)::int AS enrollments
       FROM tenancy.schools s
       LEFT JOIN student.students st ON st.school_id = s.id AND st.deleted_at IS NULL
       LEFT JOIN student.studentenrollments se ON se.student_id = st.id AND se.status = 'active'
       GROUP BY s.id, s.name
       ORDER BY enrollments DESC, s.created_at DESC
       LIMIT 1`
    );
    if (!school.rows[0]) {
      console.error('No school found. Run seed-demo-academy.mjs first.');
      process.exit(1);
    }
    const { id: schoolId, name } = school.rows[0];
    const actorId = schoolId;

    let academicYear = yearArg;
    if (!academicYear) {
      const ay = await client.query(
        `SELECT name FROM academic.academicyears
         WHERE school_id = $1 AND is_current = true LIMIT 1`,
        [schoolId]
      );
      academicYear = ay.rows[0]?.name || '2025/2026';
    }

    console.log(`→ Bootstrapping fee billing for ${name} (${academicYear}, term ${termArg})`);
    const result = await bootstrapSchoolFeeBilling(schoolId, academicYear, actorId || schoolId, { term: termArg });
    console.log(JSON.stringify(result, null, 2));
    console.log('Done. Generate term invoices in Finance → Student fees → Invoices.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
