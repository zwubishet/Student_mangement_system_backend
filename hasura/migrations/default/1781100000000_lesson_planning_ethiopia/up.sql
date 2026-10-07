-- Ethiopia MoE-aligned lesson planning, schedule config, continuous assessment backbone

CREATE SCHEMA IF NOT EXISTS planning;

-- ─── School period settings (KG / Primary / Secondary) ───────────────────────
CREATE TABLE IF NOT EXISTS planning.school_period_config (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id                 UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  level_key                 TEXT NOT NULL CHECK (level_key IN ('kg', 'primary', 'secondary')),
  periods_per_week          SMALLINT NOT NULL DEFAULT 30,
  period_duration_minutes SMALLINT NOT NULL DEFAULT 45,
  weeks_per_year            SMALLINT NOT NULL DEFAULT 30,
  school_days_per_week      SMALLINT NOT NULL DEFAULT 5,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_school_period_config UNIQUE (school_id, level_key)
);

-- Link timetable slots to academic year for planning context
ALTER TABLE academic.timetable_slots
  ADD COLUMN IF NOT EXISTS academic_year_id UUID REFERENCES academic.academicyears(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES academic.sections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS room_number TEXT;

UPDATE academic.timetable_slots ts
SET academic_year_id = c.academic_year_id,
    section_id = c.section_id
FROM academic.classes c
WHERE c.id = ts.class_id AND (ts.academic_year_id IS NULL OR ts.section_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_timetable_year_section
  ON academic.timetable_slots(academic_year_id, section_id);

-- Semester label on terms (Ethiopia: 2 semesters per year)
ALTER TABLE academic.terms
  ADD COLUMN IF NOT EXISTS semester_label TEXT;

UPDATE academic.terms SET semester_label = 'Semester 1' WHERE term_number = 1 AND semester_label IS NULL;
UPDATE academic.terms SET semester_label = 'Semester 2' WHERE term_number = 2 AND semester_label IS NULL;

-- ─── Annual plan (የዓመት የትምህርት እቅድ) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planning.annual_plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  academic_year_id    UUID NOT NULL REFERENCES academic.academicyears(id) ON DELETE CASCADE,
  term_id             UUID NOT NULL REFERENCES academic.terms(id) ON DELETE CASCADE,
  section_id          UUID NOT NULL REFERENCES academic.sections(id) ON DELETE CASCADE,
  subject_id          UUID NOT NULL REFERENCES academic.subjects(id) ON DELETE CASCADE,
  teacher_id          UUID NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  title               TEXT,
  total_periods_year  SMALLINT,
  status              TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'archived')),
  director_notes      TEXT,
  submitted_at        TIMESTAMPTZ,
  approved_by         UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ,
  created_by          UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_annual_plan_assignment UNIQUE (school_id, academic_year_id, term_id, section_id, subject_id, teacher_id)
);

CREATE INDEX IF NOT EXISTS idx_annual_plans_teacher ON planning.annual_plans(teacher_id, academic_year_id);
CREATE INDEX IF NOT EXISTS idx_annual_plans_section ON planning.annual_plans(section_id, subject_id);

CREATE TABLE IF NOT EXISTS planning.annual_plan_months (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  annual_plan_id    UUID NOT NULL REFERENCES planning.annual_plans(id) ON DELETE CASCADE,
  month_number      SMALLINT NOT NULL CHECK (month_number BETWEEN 1 AND 12),
  topic_title       TEXT NOT NULL,
  periods_allocated SMALLINT NOT NULL DEFAULT 0,
  notes             TEXT,
  sort_order        SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT uq_annual_month UNIQUE (annual_plan_id, month_number, sort_order)
);

-- ─── Unit plan (per chapter) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planning.unit_plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  annual_plan_id      UUID NOT NULL REFERENCES planning.annual_plans(id) ON DELETE CASCADE,
  unit_number         SMALLINT NOT NULL,
  unit_title          TEXT NOT NULL,
  periods_allocated   SMALLINT NOT NULL DEFAULT 1,
  general_objectives  TEXT,
  sequence_order      SMALLINT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_unit_plan UNIQUE (annual_plan_id, unit_number)
);

-- ─── Weekly plan ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planning.weekly_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_plan_id    UUID NOT NULL REFERENCES planning.unit_plans(id) ON DELETE CASCADE,
  week_number     SMALLINT NOT NULL,
  week_start_date DATE,
  topics_summary  TEXT,
  status          TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_weekly_plan UNIQUE (unit_plan_id, week_number)
);

-- ─── Daily lesson plan (የዕለት ትምህርት እቅድ) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS planning.daily_lesson_plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  academic_year_id      UUID NOT NULL REFERENCES academic.academicyears(id) ON DELETE CASCADE,
  term_id               UUID REFERENCES academic.terms(id) ON DELETE SET NULL,
  section_id            UUID NOT NULL REFERENCES academic.sections(id) ON DELETE CASCADE,
  subject_id            UUID NOT NULL REFERENCES academic.subjects(id) ON DELETE CASCADE,
  teacher_id            UUID NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  timetable_slot_id     UUID REFERENCES academic.timetable_slots(id) ON DELETE SET NULL,
  weekly_plan_id        UUID REFERENCES planning.weekly_plans(id) ON DELETE SET NULL,
  plan_date             DATE NOT NULL,
  period_number         SMALLINT,
  duration_minutes      SMALLINT NOT NULL DEFAULT 50,
  unit_title            TEXT,
  sub_unit              TEXT,
  topic                 TEXT NOT NULL,
  students_male         SMALLINT DEFAULT 0,
  students_female       SMALLINT DEFAULT 0,
  general_objective     TEXT,
  specific_objectives   JSONB NOT NULL DEFAULT '[]',
  materials             JSONB NOT NULL DEFAULT '[]',
  pre_knowledge         TEXT,
  introduction          TEXT,
  main_activity         TEXT,
  practice_activity     TEXT,
  closure_summary       TEXT,
  assessment_method     TEXT,
  homework              TEXT,
  status                TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'reviewed', 'taught', 'archived')),
  taught_at             TIMESTAMPTZ,
  reviewed_by           UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  reviewed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_plans_teacher_date ON planning.daily_lesson_plans(teacher_id, plan_date);
CREATE INDEX IF NOT EXISTS idx_daily_plans_section_date ON planning.daily_lesson_plans(section_id, plan_date);
CREATE INDEX IF NOT EXISTS idx_daily_plans_slot ON planning.daily_lesson_plans(timetable_slot_id);

-- ─── Continuous assessment (CA / AfL) entries ──────────────────────────────────
CREATE TABLE IF NOT EXISTS planning.continuous_assessments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  term_id           UUID NOT NULL REFERENCES academic.terms(id) ON DELETE CASCADE,
  section_id        UUID NOT NULL REFERENCES academic.sections(id) ON DELETE CASCADE,
  subject_id        UUID NOT NULL REFERENCES academic.subjects(id) ON DELETE CASCADE,
  student_id        UUID NOT NULL REFERENCES student.students(id) ON DELETE CASCADE,
  assessment_type   TEXT NOT NULL CHECK (assessment_type IN (
    'quiz', 'test', 'assignment', 'project', 'participation', 'homework', 'practical'
  )),
  title             TEXT NOT NULL,
  score             NUMERIC(6,2) NOT NULL,
  max_score         NUMERIC(6,2) NOT NULL DEFAULT 100,
  weight_percent    NUMERIC(5,2),
  assessed_at       DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by       UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_ca_score CHECK (score >= 0 AND max_score > 0 AND score <= max_score)
);

CREATE INDEX IF NOT EXISTS idx_ca_student_term ON planning.continuous_assessments(student_id, term_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_ca_section_subject ON planning.continuous_assessments(section_id, subject_id, term_id);

-- ─── National exam calendar reference (Ethiopia) ─────────────────────────────
CREATE TABLE IF NOT EXISTS planning.national_exam_calendar (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_level     SMALLINT NOT NULL,
  exam_code       TEXT NOT NULL,
  exam_name       TEXT NOT NULL,
  typical_month   SMALLINT CHECK (typical_month BETWEEN 1 AND 12),
  administered_by TEXT,
  description     TEXT,
  CONSTRAINT uq_national_exam_code UNIQUE (exam_code)
);

INSERT INTO planning.national_exam_calendar (grade_level, exam_code, exam_name, typical_month, administered_by, description)
VALUES
  (6, 'GRADE_6_REGIONAL', 'Grade 6 Regional (Cycle 1)', 5, 'Regional Education Bureau', 'Regional cycle-one assessment'),
  (8, 'GRADE_8_NATIONAL', 'Grade 8 National (Cycle 2)', 5, 'MoE / EAES', 'Primary leaving certificate'),
  (10, 'GRADE_10_NATIONAL', 'Grade 10 National', 5, 'EAES', 'General secondary certificate'),
  (12, 'GRADE_12_EHEECE', 'Grade 12 EHEECE', 5, 'EAES', 'University entrance examination')
ON CONFLICT (exam_code) DO NOTHING;

-- Default period configs are created per school on first access (service layer)

-- Seed Ethiopia-standard exam types if missing (40% CA / 60% final guidance)
INSERT INTO operations.exam_types (school_id, code, name, default_weight_percent, counts_toward_term, sort_order)
SELECT s.id, 'continuous_assessment', 'Continuous Assessment (CA)', 40, true, 1
FROM tenancy.schools s
WHERE NOT EXISTS (
  SELECT 1 FROM operations.exam_types et WHERE et.school_id = s.id AND et.code = 'continuous_assessment'
);

INSERT INTO operations.exam_types (school_id, code, name, default_weight_percent, counts_toward_term, sort_order)
SELECT s.id, 'semester_final', 'Semester Final Exam', 60, true, 2
FROM tenancy.schools s
WHERE NOT EXISTS (
  SELECT 1 FROM operations.exam_types et WHERE et.school_id = s.id AND et.code = 'semester_final'
);
