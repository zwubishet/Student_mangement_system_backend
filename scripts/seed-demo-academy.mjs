#!/usr/bin/env node
/**
 * Populate Demo Academy (admin@demoschool.edu) with academic structure,
 * 20 teachers, and ~35–40 students per section (4 sections × 2 grades).
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/seed-demo-academy.mjs
 *   SEED_FORCE=1 node scripts/seed-demo-academy.mjs   # re-run even if data exists
 *
 * Default passwords: Teacher123! / Student123!
 */

import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import pg from 'pg';

dotenv.config();

const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL || 'admin@demoschool.edu').toLowerCase().trim();
const TEACHER_PASSWORD = process.env.SEED_TEACHER_PASSWORD || 'Teacher123!';
const STUDENT_PASSWORD = process.env.SEED_STUDENT_PASSWORD || 'Student123!';
const FORCE = process.env.SEED_FORCE === '1' || process.env.SEED_FORCE === 'true';
const TEACHER_COUNT = Number(process.env.SEED_TEACHERS || 20);

const GRADES = [
  { name: 'Grade 9', level: 9, sections: ['A', 'B'] },
  { name: 'Grade 10', level: 10, sections: ['A', 'B'] },
];

const SUBJECTS = [
  { name: 'Mathematics', code: 'MATH', is_core: true },
  { name: 'English', code: 'ENG', is_core: true },
  { name: 'Amharic', code: 'AMH', is_core: true },
  { name: 'Physics', code: 'PHY', is_core: false },
  { name: 'Chemistry', code: 'CHE', is_core: false },
  { name: 'Biology', code: 'BIO', is_core: false },
  { name: 'Civics', code: 'CIV', is_core: true },
  { name: 'ICT', code: 'ICT', is_core: false },
];

const TEACHER_FIRST = [
  'Abebe', 'Tigist', 'Dawit', 'Hanna', 'Yonas', 'Meron', 'Samuel', 'Selam',
  'Bereket', 'Rahel', 'Daniel', 'Eden', 'Michael', 'Sara', 'Henok', 'Liya',
  'Getachew', 'Mihret', 'Solomon', 'Bethel',
];
const TEACHER_LAST = [
  'Tesfaye', 'Haile', 'Bekele', 'Alemu', 'Girma', 'Kebede', 'Desta', 'Molla',
  'Assefa', 'Worku', 'Negash', 'Tadesse', 'Mulugeta', 'Yohannes', 'Fikadu',
  'Demissie', 'Wondimu', 'Gebre', 'Hailu', 'Lemma',
];

const STUDENT_FIRST_M = ['Abel', 'Biniam', 'Chala', 'Dereje', 'Ermias', 'Fikadu', 'Getnet', 'Habtamu', 'Isaias', 'Jonas'];
const STUDENT_FIRST_F = ['Almaz', 'Birtukan', 'Chaltu', 'Desta', 'Eleni', 'Frehiwot', 'Genet', 'Hanan', 'Kalkidan', 'Lulit'];
const STUDENT_LAST = ['Aberra', 'Balcha', 'Chernet', 'Dibaba', 'Endale', 'Fenta', 'G/medhin', 'Hunde', 'Kassa', 'Lemma', 'Mekonnen', 'Negussie', 'Oliyad', 'Regassa', 'Shiferaw', 'Tilahun', 'Wolde', 'Yimer', 'Zenebe', 'Zewdu'];

const dbUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
if (!dbUrl) {
  console.error('Set DATABASE_URL or NEON_DATABASE_URL');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: dbUrl,
  ssl: dbUrl.includes('neon.tech') ? { rejectUnauthorized: false } : false,
});

async function getRoleId(client, name) {
  const r = await client.query(
    `SELECT id FROM identity.roles WHERE name = $1 AND school_id IS NULL LIMIT 1`,
    [name]
  );
  return r.rows[0]?.id;
}

function pick(arr, i) {
  return arr[i % arr.length];
}

function studentsForSection(gradeKey, sectionName, count) {
  const rows = [];
  for (let i = 1; i <= count; i += 1) {
    const female = i % 2 === 0;
    const first = pick(female ? STUDENT_FIRST_F : STUDENT_FIRST_M, i + gradeKey.length);
    const last = pick(STUDENT_LAST, i * 3 + sectionName.charCodeAt(0));
    const adm = `DEMO-${gradeKey}${sectionName}-${String(i).padStart(3, '0')}`;
    rows.push({
      admission_number: adm,
      email: `${adm.toLowerCase()}@demo.local`,
      first_name: first,
      last_name: last,
      gender: female ? 'female' : 'male',
      roll_number: i,
    });
  }
  return rows;
}

function randomStudentsPerSection() {
  return 35 + Math.floor(Math.random() * 6); // 35–40
}

async function ensureAcademicYear(client, schoolId, actorId) {
  const existing = await client.query(
    `SELECT id, name FROM academic.academicyears
     WHERE school_id = $1 AND is_deleted = false
     ORDER BY is_current DESC, created_at DESC LIMIT 1`,
    [schoolId]
  );
  if (existing.rows[0] && !FORCE) return existing.rows[0].id;

  await client.query(
    `UPDATE academic.academicyears SET is_current = false WHERE school_id = $1`,
    [schoolId]
  );

  const again = await client.query(
    `SELECT id FROM academic.academicyears WHERE school_id = $1 AND name = '2025/2026' LIMIT 1`,
    [schoolId]
  );
  if (again.rows[0]) {
    await client.query(
      `UPDATE academic.academicyears SET is_current = true, status = 'active', is_deleted = false
       WHERE id = $1`,
      [again.rows[0].id]
    );
    return again.rows[0].id;
  }

  const fallback = await client.query(
    `INSERT INTO academic.academicyears (
       school_id, name, start_date, end_date, status, is_current, created_by
     ) VALUES ($1, '2025/2026', '2025-09-01', '2026-07-15', 'active', true, $2)
     RETURNING id`,
    [schoolId, actorId]
  );
  return fallback.rows[0].id;
}

async function ensureTerm(client, schoolId, yearId, actorId) {
  const t = await client.query(
    `SELECT id FROM academic.terms WHERE school_id = $1 AND academic_year_id = $2 AND is_deleted = false
     ORDER BY is_current DESC LIMIT 1`,
    [schoolId, yearId]
  );
  if (t.rows[0]) {
    await client.query(
      `UPDATE academic.terms SET is_current = true, status = 'active' WHERE id = $1`,
      [t.rows[0].id]
    );
    return t.rows[0].id;
  }

  await client.query(
    `UPDATE academic.terms SET is_current = false WHERE school_id = $1`,
    [schoolId]
  );

  const ins = await client.query(
    `INSERT INTO academic.terms (
       school_id, academic_year_id, name, start_date, end_date, term_number, status, is_current
     ) VALUES ($1, $2, 'Semester 1', '2025-09-01', '2026-01-31', 1, 'active', true)
     RETURNING id`,
    [schoolId, yearId]
  );
  return ins.rows[0].id;
}

async function ensureGrade(client, schoolId, name, levelOrder) {
  const byName = await client.query(
    `SELECT id FROM academic.grades WHERE school_id = $1 AND LOWER(name) = LOWER($2)`,
    [schoolId, name]
  );
  if (byName.rows[0]) return byName.rows[0].id;

  const byLevel = await client.query(
    `SELECT id FROM academic.grades WHERE school_id = $1 AND level_order = $2`,
    [schoolId, levelOrder]
  );
  if (byLevel.rows[0]) {
    await client.query(
      `UPDATE academic.grades SET name = $1 WHERE id = $2 AND school_id = $3`,
      [name, byLevel.rows[0].id, schoolId]
    );
    return byLevel.rows[0].id;
  }

  const ins = await client.query(
    `INSERT INTO academic.grades (school_id, name, level_order) VALUES ($1, $2, $3) RETURNING id`,
    [schoolId, name, levelOrder]
  );
  return ins.rows[0].id;
}

async function ensureSection(client, schoolId, gradeId, name) {
  const r = await client.query(
    `SELECT id FROM academic.sections WHERE school_id = $1 AND grade_id = $2 AND LOWER(name) = LOWER($3)`,
    [schoolId, gradeId, name]
  );
  if (r.rows[0]) return r.rows[0].id;
  const ins = await client.query(
    `INSERT INTO academic.sections (school_id, grade_id, name) VALUES ($1, $2, $3) RETURNING id`,
    [schoolId, gradeId, name]
  );
  return ins.rows[0].id;
}

async function ensureClass(client, schoolId, sectionId, gradeId, yearId, displayName, actorId) {
  const r = await client.query(
    `INSERT INTO academic.classes (
       school_id, section_id, name, grade_id, grade_level_id, capacity, academic_year_id, created_by
     ) VALUES ($1, $2, $3, $4, $4, 50, $5, $6)
     ON CONFLICT (section_id, academic_year_id)
     DO UPDATE SET
       name = EXCLUDED.name,
       capacity = GREATEST(academic.classes.capacity, 50),
       grade_id = EXCLUDED.grade_id,
       is_deleted = false,
       updated_at = NOW()
     RETURNING id`,
    [schoolId, sectionId, displayName, gradeId, yearId, actorId]
  );
  return r.rows[0].id;
}

async function ensureDemoExam(client, schoolId, actorId, termId, sectionTargets, subjectIds) {
  const existing = await client.query(
    `SELECT id FROM operations.exams WHERE school_id = $1 AND name = 'Demo Midterm 2025' LIMIT 1`,
    [schoolId]
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const mathSubject = subjectIds[0];
  const ins = await client.query(
    `INSERT INTO operations.exams (
       school_id, name, term_id, weightage, status, exam_type, max_score, pass_score,
       exam_date, instructions, created_by
     ) VALUES ($1, 'Demo Midterm 2025', $2, 30, 'ACTIVE', 'midterm', 100, 50,
       '2026-03-15', 'Seeded demo exam for teacher portal mark entry.', $3)
     RETURNING id`,
    [schoolId, termId, actorId]
  );
  const examId = ins.rows[0].id;

  for (const sec of sectionTargets) {
    const dup = await client.query(
      `SELECT 1 FROM operations.exam_schedules
       WHERE exam_id = $1 AND class_id = $2 AND subject_id = $3`,
      [examId, sec.classId, mathSubject]
    );
    if (!dup.rows.length) {
      await client.query(
        `INSERT INTO operations.exam_schedules (
           school_id, exam_id, class_id, subject_id, max_score, pass_score
         ) VALUES ($1, $2, $3, $4, 100, 50)`,
        [schoolId, examId, sec.classId, mathSubject]
      );
    }
  }

  return examId;
}

/** Weekly timetable for assigned teachers (Mon–Fri, periods 1–2). */
async function ensureDemoTimetable(client, schoolId) {
  const assignments = await client.query(
    `SELECT ta.teacher_id, ta.subject_id, ta.section_id, c.id AS class_id
     FROM academic.teacherassignments ta
     JOIN academic.classes c ON c.section_id = ta.section_id AND c.school_id = $1
     JOIN academic.academicyears ay ON ay.id = c.academic_year_id AND ay.is_current = true
     WHERE c.school_id = $1`,
    [schoolId]
  );

  const slots = [
    { day: 1, period: 1, start: '08:00', end: '08:45' },
    { day: 3, period: 2, start: '09:00', end: '09:45' },
    { day: 5, period: 1, start: '08:00', end: '08:45' },
  ];
  let created = 0;

  for (const row of assignments.rows) {
    for (const slot of slots) {
      const dup = await client.query(
        `SELECT 1 FROM academic.timetable_slots
         WHERE class_id = $1 AND day_of_week = $2 AND period_number = $3`,
        [row.class_id, slot.day, slot.period]
      );
      if (dup.rows.length) continue;
      await client.query(
        `INSERT INTO academic.timetable_slots (
           school_id, class_id, subject_id, teacher_id, day_of_week, period_number, start_time, end_time
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          schoolId, row.class_id, row.subject_id, row.teacher_id,
          slot.day, slot.period, slot.start, slot.end,
        ]
      );
      created += 1;
    }
  }
  return created;
}

/** Primary guardian contacts for roster preview (first 3 students per section). */
async function ensureSampleGuardians(client, schoolId, sectionTargets) {
  let linked = 0;
  for (const sec of sectionTargets) {
    const students = await client.query(
      `SELECT s.id, s.first_name, s.last_name
       FROM student.studentenrollments se
       JOIN student.students s ON s.id = se.student_id
       WHERE se.section_id = $1 AND se.status = 'active' AND s.deleted_at IS NULL
       ORDER BY s.last_name, s.first_name
       LIMIT 3`,
      [sec.sectionId]
    );
    for (const st of students.rows) {
      const hasLink = await client.query(
        `SELECT 1 FROM student.guardian_links WHERE student_id = $1 LIMIT 1`,
        [st.id]
      );
      if (hasLink.rows.length) continue;

      const gIns = await client.query(
        `INSERT INTO student.guardians (
           school_id, first_name, last_name, relationship, phone_primary, email
         ) VALUES ($1, $2, $3, 'parent', $4, $5)
         RETURNING id`,
        [
          schoolId,
          `${st.first_name} Parent`,
          st.last_name,
          `+251911${String(Math.floor(Math.random() * 900000) + 100000)}`,
          `guardian.${st.first_name.toLowerCase()}.${st.last_name.toLowerCase()}@demo.local`,
        ]
      );
      await client.query(
        `INSERT INTO student.guardian_links (student_id, guardian_id, is_primary, is_emergency, can_pickup)
         VALUES ($1, $2, true, true, true)
         ON CONFLICT DO NOTHING`,
        [st.id, gIns.rows[0].id]
      );
      linked += 1;
    }
  }
  return linked;
}

async function ensureSubject(client, schoolId, sub) {
  const r = await client.query(
    `SELECT id FROM academic.subjects WHERE school_id = $1 AND LOWER(code) = LOWER($2)`,
    [schoolId, sub.code]
  );
  if (r.rows[0]) return r.rows[0].id;
  const ins = await client.query(
    `INSERT INTO academic.subjects (school_id, name, code, is_core)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [schoolId, sub.name, sub.code, sub.is_core]
  );
  return ins.rows[0].id;
}

async function ensureTeacher(client, schoolId, actorId, teacherRoleId, idx, hash) {
  const first = TEACHER_FIRST[idx];
  const last = TEACHER_LAST[idx];
  const email = `teacher${String(idx + 1).padStart(2, '0')}@demo.local`;
  const staffNum = `TCH-${String(idx + 1).padStart(3, '0')}`;

  const exists = await client.query(`SELECT id FROM identity.users WHERE lower(email) = $1`, [email]);
  if (exists.rows[0]) {
    const t = await client.query(
      `SELECT user_id FROM academic.teachers WHERE email = $1 AND school_id = $2`,
      [email, schoolId]
    );
    return { user_id: exists.rows[0].id, teacher_id: t.rows[0]?.user_id, email, skipped: true };
  }

  const userRes = await client.query(
    `INSERT INTO identity.users (email, first_name, last_name, school_id, status, password_hash)
     VALUES ($1, $2, $3, $4, 'active', $5) RETURNING id`,
    [email, first, last, schoolId, hash]
  );
  const userId = userRes.rows[0].id;
  await client.query(
    `INSERT INTO identity.userroles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, teacherRoleId]
  );

  const hireDate = '2024-09-01';
  const dept = ['Sciences', 'Languages', 'Social Studies', 'ICT'][idx % 4];

  const staffRes = await client.query(
    `INSERT INTO identity.staff_profiles (
       school_id, user_id, staff_id_number, hire_date, employment_type, department, created_by
     ) VALUES ($1, $2, $3, $4, 'permanent', $5, $6) RETURNING id`,
    [schoolId, userId, staffNum, hireDate, dept, actorId]
  );

  await client.query(
    `INSERT INTO academic.teachers (
       school_id, user_id, staff_profile_id, first_name, last_name, email, hire_date, department, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')`,
    [schoolId, userId, staffRes.rows[0].id, first, last, email, hireDate, dept]
  );

  return { user_id: userId, email, skipped: false };
}

async function enrollStudent(client, schoolId, actorId, studentRoleId, studentHash, row, sectionId, yearId, classId) {
  const dup = await client.query(
    `SELECT id FROM student.students WHERE school_id = $1 AND admission_number = $2`,
    [schoolId, row.admission_number]
  );
  if (dup.rows[0]) return { skipped: true };

  const userRes = await client.query(
    `INSERT INTO identity.users (email, password_hash, school_id, first_name, last_name, status)
     VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
    [row.email, studentHash, schoolId, row.first_name, row.last_name]
  );
  const userId = userRes.rows[0].id;
  await client.query(
    `INSERT INTO identity.userroles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, studentRoleId]
  );

  const dobYear = 2010 - Math.floor(Math.random() * 3);
  const studentRes = await client.query(
    `INSERT INTO student.students (
       school_id, user_id, admission_number, student_id_number, first_name, last_name,
       gender, date_of_birth, nationality, lifecycle_status, created_by
     ) VALUES ($1, $2, $3, $3, $4, $5, $6, $7, 'Ethiopian', 'active', $8) RETURNING id`,
    [
      schoolId, userId, row.admission_number, row.first_name, row.last_name,
      row.gender, `${dobYear}-05-15`, actorId,
    ]
  );

  await client.query(
    `INSERT INTO student.studentenrollments (
       school_id, student_id, section_id, academic_year_id, class_id, roll_number, enrolled_by, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
    [schoolId, studentRes.rows[0].id, sectionId, yearId, classId, row.roll_number, actorId]
  );

  return { skipped: false };
}

async function main() {
  const client = await pool.connect();
  try {
    const admin = await client.query(
      `SELECT u.id AS user_id, u.school_id, s.name AS school_name
       FROM identity.users u
       JOIN tenancy.schools s ON s.id = u.school_id
       WHERE lower(u.email) = $1`,
      [ADMIN_EMAIL]
    );
    if (!admin.rows[0]) {
      console.error(`No user found for ${ADMIN_EMAIL}. Run: npm run seed (seed-neon.mjs) first.`);
      process.exit(1);
    }

    const { school_id: schoolId, user_id: actorId, school_name: schoolName } = admin.rows[0];

    const counts = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM academic.teachers WHERE school_id = $1) AS teachers,
         (SELECT COUNT(*)::int FROM student.students WHERE school_id = $1 AND deleted_at IS NULL) AS students`,
      [schoolId]
    );
    const { teachers: existingTeachers, students: existingStudents } = counts.rows[0];

    if (!FORCE && existingStudents >= 120 && existingTeachers >= 15) {
      console.log(`School "${schoolName}" already has ${existingStudents} students and ${existingTeachers} teachers.`);
      console.log('Set SEED_FORCE=1 to run again.');
      process.exit(0);
    }

    const [teacherRoleId, studentRoleId] = await Promise.all([
      getRoleId(client, 'TEACHER'),
      getRoleId(client, 'STUDENT'),
    ]);
    if (!teacherRoleId || !studentRoleId) {
      console.error('Platform roles TEACHER/STUDENT missing. Run migrations + seed-neon.');
      process.exit(1);
    }

    const teacherHash = await bcrypt.hash(TEACHER_PASSWORD, 12);
    const studentHash = await bcrypt.hash(STUDENT_PASSWORD, 12);

    await client.query('BEGIN');

    const yearId = await ensureAcademicYear(client, schoolId, actorId);
    const termId = await ensureTerm(client, schoolId, yearId, actorId);

    const subjectIds = [];
    for (const sub of SUBJECTS) {
      subjectIds.push(await ensureSubject(client, schoolId, sub));
    }

    const sectionTargets = [];
    for (const g of GRADES) {
      const gradeId = await ensureGrade(client, schoolId, g.name, g.level);
      const gradeKey = `G${g.level}`;
      for (const secName of g.sections) {
        const sectionId = await ensureSection(client, schoolId, gradeId, secName);
        const className = `${g.name} - Section ${secName}`;
        const classId = await ensureClass(client, schoolId, sectionId, gradeId, yearId, className, actorId);
        const studentCount = randomStudentsPerSection();
        sectionTargets.push({ gradeKey, secName, sectionId, classId, studentCount, className });
      }
    }

    let teachersCreated = 0;
    const teacherUsers = [];
    for (let i = 0; i < TEACHER_COUNT; i += 1) {
      const t = await ensureTeacher(client, schoolId, actorId, teacherRoleId, i, teacherHash);
      teacherUsers.push(t);
      if (!t.skipped) teachersCreated += 1;
    }

    let assignCount = 0;
    let tIdx = 0;
    for (const sec of sectionTargets) {
      for (let s = 0; s < subjectIds.length; s += 1) {
        const teacher = teacherUsers[tIdx % teacherUsers.length];
        if (!teacher?.user_id) continue;
        const exists = await client.query(
          `SELECT 1 FROM academic.teacherassignments
           WHERE teacher_id = $1 AND subject_id = $2 AND section_id = $3`,
          [teacher.user_id, subjectIds[s], sec.sectionId]
        );
        if (!exists.rows.length) {
          await client.query(
            `INSERT INTO academic.teacherassignments (teacher_id, subject_id, section_id)
             VALUES ($1, $2, $3)`,
            [teacher.user_id, subjectIds[s], sec.sectionId]
          );
          assignCount += 1;
        }
        tIdx += 1;
      }
    }

    let studentsCreated = 0;
    let studentsSkipped = 0;
    for (const sec of sectionTargets) {
      const rows = studentsForSection(sec.gradeKey, sec.secName, sec.studentCount);
      for (const row of rows) {
        const r = await enrollStudent(
          client, schoolId, actorId, studentRoleId, studentHash, row,
          sec.sectionId, yearId, sec.classId
        );
        if (r.skipped) studentsSkipped += 1;
        else studentsCreated += 1;
      }
    }

    const examId = await ensureDemoExam(client, schoolId, actorId, termId, sectionTargets, subjectIds);
    const timetableSlots = await ensureDemoTimetable(client, schoolId);
    const guardianLinks = await ensureSampleGuardians(client, schoolId, sectionTargets);

    await client.query('COMMIT');

    const totalPerSection = sectionTargets.map((s) => `${s.className}: ${s.studentCount}`).join('\n  ');

    console.log('\nDemo Academy seed complete.\n');
    console.log(`  School: ${schoolName} (${schoolId})`);
    console.log(`  Academic year: 2025/2026 (${yearId})`);
    console.log(`  Grades: ${GRADES.map((g) => g.name).join(', ')}`);
    console.log(`  Sections: ${sectionTargets.length} (2 per grade)`);
    console.log(`  Teachers created: ${teachersCreated} (login teacher01@demo.local … teacher${String(TEACHER_COUNT).padStart(2, '0')}@demo.local / ${TEACHER_PASSWORD})`);
    console.log(`  Students created: ${studentsCreated} (skipped existing: ${studentsSkipped})`);
    console.log(`  Per section:\n  ${totalPerSection}`);
    console.log(`  Student login: DEMO-G9A-001@demo.local / ${STUDENT_PASSWORD}`);
    if (examId) console.log(`  Demo exam: Demo Midterm 2025 (${examId}) — ACTIVE with ${sectionTargets.length} schedules`);
    console.log(`  Timetable slots created: ${timetableSlots}`);
    console.log(`  Guardian contacts linked: ${guardianLinks}`);
    console.log('\n');
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
