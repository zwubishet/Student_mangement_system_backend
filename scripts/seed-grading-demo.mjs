#!/usr/bin/env node
/**
 * Seed published grading data for parent/student portal demos.
 *
 * Creates grading config (scale, exam types, term weights), published exams
 * with locked marks for Grade 9 sections, and runs term computation.
 *
 * Usage:
 *   DATABASE_URL=postgres://sms_user:sms_pass@localhost:5432/sms_db node scripts/seed-grading-demo.mjs
 *   SEED_FORCE=1 node scripts/seed-grading-demo.mjs   # overwrite marks on existing seeded exams
 */

import dotenv from 'dotenv';
import pg from 'pg';
import { runTermComputation } from '../src/services/grading/computationService.js';

dotenv.config();

const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL || 'admin@demoschool.edu').toLowerCase().trim();
const FORCE = process.env.SEED_FORCE === '1' || process.env.SEED_FORCE === 'true';

const PARENT_STUDENTS = [
  '5085c85b-abc7-411a-8e75-55375781db92',
  'dfb382b3-7074-4146-8b2b-958b9a65e091',
];

const ETHIOPIAN_BANDS = [
  { letter: 'A', min: 90, max: 100, gpa: 4.0, pass: true, order: 1 },
  { letter: 'B', min: 80, max: 89.99, gpa: 3.0, pass: true, order: 2 },
  { letter: 'C', min: 70, max: 79.99, gpa: 2.0, pass: true, order: 3 },
  { letter: 'D', min: 60, max: 69.99, gpa: 1.0, pass: true, order: 4 },
  { letter: 'F', min: 0, max: 59.99, gpa: 0.0, pass: false, order: 5 },
];

const EXAM_DEFS = [
  { name: 'Demo Midterm 2025', exam_type: 'midterm', subjectCode: 'MATH', max: 100, pass: 50, date: '2026-03-15', weight: 30 },
  { name: 'Grade 9 English Quiz 1', exam_type: 'quiz', subjectCode: 'ENG', max: 20, pass: 10, date: '2026-02-10', weight: 10 },
  { name: 'Grade 9 Amharic Assignment 1', exam_type: 'assignment', subjectCode: 'AMH', max: 50, pass: 25, date: '2026-02-20', weight: 10 },
];

const dbUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || 'postgres://sms_user:sms_pass@localhost:5432/sms_db';
const pool = new pg.Pool({
  connectionString: dbUrl,
  ssl: dbUrl.includes('neon.tech') ? { rejectUnauthorized: false } : false,
});

function scoreToGrade(score, maxScore) {
  const pct = (Number(score) / Number(maxScore)) * 100;
  for (const b of ETHIOPIAN_BANDS) {
    if (pct >= b.min && pct <= b.max) {
      return { letter: b.letter, gpa: b.gpa, passed: b.pass && Number(score) >= (maxScore * 0.5) };
    }
  }
  return { letter: 'F', gpa: 0, passed: false };
}

async function ensureGradingConfig(client, schoolId) {
  let profileId;
  const profile = await client.query(
    `SELECT id FROM operations.grading_scale_profiles
     WHERE school_id = $1 AND is_active = true AND is_deleted = false LIMIT 1`,
    [schoolId]
  );
  if (profile.rows[0]) {
    profileId = profile.rows[0].id;
  } else {
    const ins = await client.query(
      `INSERT INTO operations.grading_scale_profiles
         (school_id, name, scale_type, version, is_active, boundary_rule)
       VALUES ($1, 'Ethiopian Standard', 'percentage', 1, true, 'inclusive_max')
       RETURNING id`,
      [schoolId]
    );
    profileId = ins.rows[0].id;
    for (const b of ETHIOPIAN_BANDS) {
      await client.query(
        `INSERT INTO operations.grading_scales
           (school_id, profile_id, label, letter_grade, min_score, max_score, grade_points, sort_order, is_pass)
         VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8)`,
        [schoolId, profileId, b.letter, b.min, b.max, b.gpa, b.order, b.pass]
      );
    }
  }

  const typeDefs = [
    { code: 'quiz', name: 'Quiz', weight: 10 },
    { code: 'assignment', name: 'Assignment', weight: 10 },
    { code: 'practical', name: 'Practical', weight: 10 },
    { code: 'midterm', name: 'Midterm', weight: 30 },
    { code: 'final', name: 'Final Exam', weight: 40 },
  ];
  const typeIds = {};
  for (const t of typeDefs) {
    const row = await client.query(
      `INSERT INTO operations.exam_types (school_id, code, name, default_weight_percent, counts_toward_term, sort_order)
       VALUES ($1, $2, $3, $4, true, $5)
       ON CONFLICT (school_id, code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [schoolId, t.code, t.name, t.weight, typeDefs.indexOf(t)]
    );
    typeIds[t.code] = row.rows[0].id;
  }

  return { profileId, typeIds };
}

async function ensureTermWeights(client, schoolId, termId, typeIds) {
  const weights = [
    { code: 'quiz', pct: 10 },
    { code: 'assignment', pct: 10 },
    { code: 'practical', pct: 10 },
    { code: 'midterm', pct: 30 },
    { code: 'final', pct: 40 },
  ];
  for (const w of weights) {
    await client.query(
      `INSERT INTO operations.term_assessment_weights (school_id, term_id, subject_id, exam_type_id, weight_percent)
       VALUES ($1, $2, NULL, $3, $4)
       ON CONFLICT (term_id, subject_id, exam_type_id)
       DO UPDATE SET weight_percent = EXCLUDED.weight_percent, updated_at = NOW()`,
      [schoolId, termId, typeIds[w.code], w.pct]
    );
  }
}

async function getSubjectMap(client, schoolId) {
  const subs = await client.query(
    `SELECT id, code, name FROM academic.subjects WHERE school_id = $1`,
    [schoolId]
  );
  const map = {};
  for (const s of subs.rows) map[s.code] = s;
  return map;
}

async function ensureExam(client, schoolId, actorId, termId, def, typeIds, subjectMap, classes) {
  const subject = subjectMap[def.subjectCode];
  if (!subject) throw new Error(`Subject ${def.subjectCode} not found`);

  let examId;
  const existing = await client.query(
    `SELECT id, status FROM operations.exams WHERE school_id = $1 AND name = $2 AND is_deleted = false LIMIT 1`,
    [schoolId, def.name]
  );
  if (existing.rows[0]) {
    examId = existing.rows[0].id;
    await client.query(
      `UPDATE operations.exams SET status = 'PUBLISHED', exam_type_id = $2, updated_at = NOW()
       WHERE id = $1`,
      [examId, typeIds[def.exam_type]]
    );
  } else {
    const ins = await client.query(
      `INSERT INTO operations.exams (
         school_id, name, term_id, weightage, status, exam_type, exam_type_id,
         max_score, pass_score, exam_date, instructions, created_by
       ) VALUES ($1, $2, $3, $4, 'PUBLISHED', $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        schoolId, def.name, termId, def.weight, def.exam_type, typeIds[def.exam_type],
        def.max, def.pass, def.date, `Seeded ${def.name} for portal demo`, actorId,
      ]
    );
    examId = ins.rows[0].id;
  }

  const schedules = [];
  for (const cls of classes) {
    let sched = await client.query(
      `SELECT id FROM operations.exam_schedules
       WHERE exam_id = $1 AND class_id = $2 AND subject_id = $3 LIMIT 1`,
      [examId, cls.class_id, subject.id]
    );
    if (!sched.rows[0]) {
      sched = await client.query(
        `INSERT INTO operations.exam_schedules
           (school_id, exam_id, class_id, subject_id, max_score, pass_score, status, marks_locked_at, results_ready)
         VALUES ($1, $2, $3, $4, $5, $6, 'completed', NOW(), true)
         RETURNING id`,
        [schoolId, examId, cls.class_id, subject.id, def.max, def.pass]
      );
    } else {
      await client.query(
        `UPDATE operations.exam_schedules
         SET marks_locked_at = COALESCE(marks_locked_at, NOW()), results_ready = true, status = 'completed'
         WHERE id = $1`,
        [sched.rows[0].id]
      );
    }
    schedules.push({
      schedule_id: sched.rows[0].id,
      class_id: cls.class_id,
      section_id: cls.section_id,
      subject_id: subject.id,
      max_score: def.max,
      pass_score: def.pass,
    });
  }
  return { examId, schedules, subject };
}

async function ensureExamSubject(client, examId, subjectId, sectionId, max, pass) {
  const row = await client.query(
    `INSERT INTO operations.examsubjects (exam_id, subject_id, section_id, max_score, passing_score)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (exam_id, subject_id, section_id) DO UPDATE SET max_score = EXCLUDED.max_score
     RETURNING id`,
    [examId, subjectId, sectionId, max, pass]
  );
  return row.rows[0].id;
}

/** Deterministic score per student for demo variety. */
function demoScore(studentId, examName, maxScore) {
  const presets = {
    '5085c85b-abc7-411a-8e75-55375781db92': {
      'Demo Midterm 2025': 88,
      'Grade 9 English Quiz 1': 18,
      'Grade 9 Amharic Assignment 1': 39,
    },
    'dfb382b3-7074-4146-8b2b-958b9a65e091': {
      'Demo Midterm 2025': 65,
      'Grade 9 English Quiz 1': 14,
      'Grade 9 Amharic Assignment 1': 28,
    },
  };
  if (presets[studentId]?.[examName] != null) {
    return Math.min(presets[studentId][examName], maxScore);
  }
  let hash = 0;
  const key = `${studentId}:${examName}`;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) % 1000;
  return Math.round((45 + (hash % 45)) * maxScore / 100);
}

async function seedMarksForSchedule(client, {
  schoolId, examId, examName, schedule, actorId, profileId, students,
}) {
  const examSubjectId = await ensureExamSubject(
    client, examId, schedule.subject_id, schedule.section_id,
    schedule.max_score, schedule.pass_score
  );

  let count = 0;
  for (const st of students) {
    if (st.class_id !== schedule.class_id) continue;

    const existing = await client.query(
      `SELECT id FROM operations.examresults WHERE exam_subject_id = $1 AND student_id = $2`,
      [examSubjectId, st.student_id]
    );
    if (existing.rows[0] && !FORCE) continue;

    const score = demoScore(st.student_id, examName, schedule.max_score);
    const { letter, gpa, passed } = scoreToGrade(score, schedule.max_score);

    await client.query(
      `INSERT INTO operations.examresults (
         exam_subject_id, student_id, score, grade, grade_points, is_absent, is_passed,
         entered_by, entered_at, verified_by, verified_at, submitted_at, locked_at,
         exam_id, subject_id, class_id, schedule_id, mark_status, scale_profile_id
       ) VALUES ($1,$2,$3,$4,$5,false,$6,$7,NOW(),$7,NOW(),NOW(),NOW(),$8,$9,$10,$11,'locked',$12)
       ON CONFLICT (exam_subject_id, student_id) DO UPDATE SET
         score = EXCLUDED.score, grade = EXCLUDED.grade, grade_points = EXCLUDED.grade_points,
         is_passed = EXCLUDED.is_passed, mark_status = 'locked',
         verified_at = NOW(), locked_at = NOW(), updated_at = NOW()`,
      [
        examSubjectId, st.student_id, score, letter, gpa, passed,
        actorId, examId, schedule.subject_id, schedule.class_id,
        schedule.schedule_id, profileId,
      ]
    );
    count += 1;
  }
  return count;
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const admin = await client.query(
      `SELECT u.id AS actor_id, u.school_id, s.name AS school_name
       FROM identity.users u
       JOIN tenancy.schools s ON s.id = u.school_id
       WHERE lower(u.email) = $1 LIMIT 1`,
      [ADMIN_EMAIL]
    );
    if (!admin.rows[0]) throw new Error(`Admin ${ADMIN_EMAIL} not found`);
    const { actor_id: actorId, school_id: schoolId, school_name: schoolName } = admin.rows[0];

    const term = await client.query(
      `SELECT t.id, t.academic_year_id
       FROM academic.terms t
       WHERE t.school_id = $1 AND t.is_current = true
       ORDER BY t.created_at DESC LIMIT 1`,
      [schoolId]
    );
    if (!term.rows[0]) throw new Error('No current term');
    const termId = term.rows[0].id;

    const classes = (await client.query(
      `SELECT c.id AS class_id, sec.id AS section_id, sec.name AS section_name, g.name AS grade_name
       FROM academic.classes c
       JOIN academic.sections sec ON sec.id = c.section_id
       JOIN academic.grades g ON g.id = c.grade_id
       JOIN academic.academicyears ay ON ay.id = c.academic_year_id AND ay.is_current = true
       WHERE c.school_id = $1 AND g.name = 'Grade 9'
       ORDER BY sec.name`,
      [schoolId]
    )).rows;

    if (!classes.length) throw new Error('No Grade 9 classes found');

    const students = (await client.query(
      `SELECT se.student_id, se.class_id, s.first_name, s.last_name
       FROM student.studentenrollments se
       JOIN student.students s ON s.id = se.student_id
       WHERE se.status = 'active' AND se.class_id = ANY($1::uuid[]) AND s.deleted_at IS NULL`,
      [classes.map((c) => c.class_id)]
    )).rows;

    const { profileId, typeIds } = await ensureGradingConfig(client, schoolId);
    await ensureTermWeights(client, schoolId, termId, typeIds);
    const subjectMap = await getSubjectMap(client, schoolId);

    let totalMarks = 0;
    const examIds = [];
    for (const def of EXAM_DEFS) {
      const { examId, schedules } = await ensureExam(
        client, schoolId, actorId, termId, def, typeIds, subjectMap, classes
      );
      examIds.push(examId);
      for (const sched of schedules) {
        totalMarks += await seedMarksForSchedule(client, {
          schoolId, examId, examName: def.name, schedule: sched,
          actorId, profileId, students,
        });
      }
    }

    await client.query('COMMIT');

    const run = await pool.query(
      `INSERT INTO operations.computation_runs (school_id, term_id, run_type, status, created_by)
       VALUES ($1, $2, 'term', 'pending', $3) RETURNING id`,
      [schoolId, termId, actorId]
    );
    await runTermComputation(schoolId, termId, run.rows[0].id);

    console.log('\nGrading demo seed complete.\n');
    console.log(`  School: ${schoolName}`);
    console.log(`  Term: ${termId}`);
    console.log(`  Exams published: ${EXAM_DEFS.map((e) => e.name).join(', ')}`);
    console.log(`  Mark rows upserted: ${totalMarks}`);
    console.log(`  Students in Grade 9: ${students.length}`);
    console.log('  Parent portal test students:');
    for (const id of PARENT_STUDENTS) {
      const st = students.find((s) => s.student_id === id);
      console.log(`    - ${st ? `${st.first_name} ${st.last_name}` : id} (${id})`);
    }
    console.log('\n  View as parent: test-parent@gmail.com / Parent123!');
    console.log('  View as student: DEMO-G9A-001@demo.local / Student123!\n');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Seed failed:', err.message);
    if (err.detail) console.error('  detail:', err.detail);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
