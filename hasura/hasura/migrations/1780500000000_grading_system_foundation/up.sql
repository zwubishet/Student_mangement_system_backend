-- Grading system foundation (phases 1–10 schema backbone)
-- Conventions: school_id tenant isolation, UUID PKs, is_deleted soft delete, timestamptz audit

-- ─── Configurable exam types per school ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS operations.exam_types (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  code                  TEXT NOT NULL,
  name                  TEXT NOT NULL,
  description           TEXT,
  default_weight_percent NUMERIC(5,2) CHECK (default_weight_percent IS NULL OR (default_weight_percent >= 0 AND default_weight_percent <= 100)),
  counts_toward_term    BOOLEAN NOT NULL DEFAULT true,
  sort_order            INT NOT NULL DEFAULT 0,
  is_deleted            BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_exam_types_school_code UNIQUE (school_id, code)
);

CREATE INDEX IF NOT EXISTS idx_exam_types_school ON operations.exam_types(school_id) WHERE is_deleted = false;

-- Weight budget per term (+ optional subject): exam_type weights must sum to 100
CREATE TABLE IF NOT EXISTS operations.term_assessment_weights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  term_id         UUID NOT NULL REFERENCES academic.terms(id) ON DELETE CASCADE,
  subject_id      UUID REFERENCES academic.subjects(id) ON DELETE CASCADE,
  exam_type_id    UUID NOT NULL REFERENCES operations.exam_types(id) ON DELETE CASCADE,
  weight_percent  NUMERIC(5,2) NOT NULL CHECK (weight_percent >= 0 AND weight_percent <= 100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_term_assessment_weight UNIQUE (term_id, subject_id, exam_type_id)
);

CREATE INDEX IF NOT EXISTS idx_term_assessment_weights_term ON operations.term_assessment_weights(term_id, subject_id);

-- ─── Grading scale profiles (versioned; bands stay in grading_scales) ─────────
CREATE TABLE IF NOT EXISTS operations.grading_scale_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  name          TEXT NOT NULL DEFAULT 'Ethiopian Standard',
  scale_type    TEXT NOT NULL DEFAULT 'percentage'
    CHECK (scale_type IN ('percentage', 'raw', 'gpa')),
  version       INT NOT NULL DEFAULT 1,
  is_active     BOOLEAN NOT NULL DEFAULT false,
  effective_from DATE,
  effective_to   DATE,
  boundary_rule  TEXT NOT NULL DEFAULT 'inclusive_max'
    CHECK (boundary_rule IN ('inclusive_max', 'inclusive_min')),
  is_deleted    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_grading_scale_profiles_active
  ON operations.grading_scale_profiles(school_id)
  WHERE is_active = true AND is_deleted = false;

ALTER TABLE operations.grading_scales
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES operations.grading_scale_profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS letter_grade TEXT,
  ADD COLUMN IF NOT EXISTS is_pass BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS display_label TEXT;

UPDATE operations.grading_scales SET letter_grade = label WHERE letter_grade IS NULL;

-- Per-subject grading overrides
CREATE TABLE IF NOT EXISTS operations.subject_grade_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES academic.subjects(id) ON DELETE CASCADE,
  profile_id      UUID REFERENCES operations.grading_scale_profiles(id) ON DELETE SET NULL,
  pass_score      NUMERIC(6,2),
  use_custom_bands BOOLEAN NOT NULL DEFAULT false,
  absent_policy   TEXT NOT NULL DEFAULT 'zero'
    CHECK (absent_policy IN ('zero', 'exclude', 'null')),
  allow_bonus     BOOLEAN NOT NULL DEFAULT false,
  max_bonus_percent NUMERIC(5,2) DEFAULT 0,
  is_deleted      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_subject_grade_config UNIQUE (school_id, subject_id)
);

-- Link exams to configurable exam_types (optional FK; keep exam_type text for compat)
ALTER TABLE operations.exams
  ADD COLUMN IF NOT EXISTS exam_type_id UUID REFERENCES operations.exam_types(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exams_exam_type_check') THEN
    ALTER TABLE operations.exams DROP CONSTRAINT exams_exam_type_check;
  END IF;
  ALTER TABLE operations.exams
    ADD CONSTRAINT exams_exam_type_check
    CHECK (exam_type IN ('midterm', 'final', 'quiz', 'assignment', 'practical', 'continuous_assessment'));
END $$;

-- ─── Exam schedules: workflow fields ──────────────────────────────────────────
ALTER TABLE operations.exam_schedules
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  ADD COLUMN IF NOT EXISTS submission_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS marks_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS results_ready BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

-- ─── Mark entry status on examresults (operations.grades spec → examresults) ──
ALTER TABLE operations.examresults
  ADD COLUMN IF NOT EXISTS mark_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (mark_status IN ('draft', 'submitted', 'verified', 'locked', 'rejected')),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS scale_profile_id UUID REFERENCES operations.grading_scale_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_passed BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_examresults_mark_status ON operations.examresults(exam_id, mark_status);

CREATE TABLE IF NOT EXISTS operations.mark_review_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  exam_result_id  UUID NOT NULL REFERENCES operations.examresults(id) ON DELETE CASCADE,
  from_status     TEXT,
  to_status       TEXT NOT NULL,
  actor_id        UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mark_review_log_result ON operations.mark_review_log(exam_result_id, created_at DESC);

-- ─── Computation output (phase 6) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operations.computation_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  exam_id       UUID REFERENCES operations.exams(id) ON DELETE CASCADE,
  term_id       UUID REFERENCES academic.terms(id) ON DELETE CASCADE,
  run_type      TEXT NOT NULL CHECK (run_type IN ('exam', 'term', 'year', 'class')),
  status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'failed')),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  error_message TEXT,
  stats         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by    UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_computation_runs_pending
  ON operations.computation_runs(school_id, status) WHERE status IN ('pending', 'running');

CREATE TABLE IF NOT EXISTS operations.computed_results (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  computation_run_id  UUID REFERENCES operations.computation_runs(id) ON DELETE SET NULL,
  student_id          UUID NOT NULL REFERENCES student.students(id) ON DELETE CASCADE,
  class_id            UUID REFERENCES academic.classes(id) ON DELETE SET NULL,
  term_id             UUID REFERENCES academic.terms(id) ON DELETE CASCADE,
  academic_year_id    UUID REFERENCES academic.academicyears(id) ON DELETE CASCADE,
  subject_id          UUID REFERENCES academic.subjects(id) ON DELETE SET NULL,
  exam_id             UUID REFERENCES operations.exams(id) ON DELETE SET NULL,
  weighted_score      NUMERIC(8,4),
  total_score         NUMERIC(8,4),
  max_possible        NUMERIC(8,4),
  percentage          NUMERIC(6,2),
  grade_letter        TEXT,
  gpa_points          NUMERIC(4,2),
  rank_in_class       INT,
  rank_in_grade       INT,
  is_passed           BOOLEAN,
  absent_count        INT NOT NULL DEFAULT 0,
  result_scope        TEXT NOT NULL DEFAULT 'exam'
    CHECK (result_scope IN ('exam', 'subject_term', 'term_total', 'year_cumulative')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_computed_results_student_term
  ON operations.computed_results(school_id, student_id, term_id, result_scope);
CREATE INDEX IF NOT EXISTS idx_computed_results_class_term
  ON operations.computed_results(school_id, class_id, term_id, subject_id);

-- ─── Alerts (phase 7) ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operations.mark_alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  term_id       UUID REFERENCES academic.terms(id) ON DELETE CASCADE,
  alert_type    TEXT NOT NULL,
  severity      TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  resource_type TEXT,
  resource_id   UUID,
  message       TEXT NOT NULL,
  resolved_at   TIMESTAMPTZ,
  resolved_by   UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mark_alerts_open
  ON operations.mark_alerts(school_id, term_id) WHERE resolved_at IS NULL;

-- ─── Overrides / resits / appeals (phase 8) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS operations.resit_exams (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  student_id        UUID NOT NULL REFERENCES student.students(id) ON DELETE CASCADE,
  original_exam_id  UUID NOT NULL REFERENCES operations.exams(id) ON DELETE CASCADE,
  subject_id        UUID NOT NULL REFERENCES academic.subjects(id) ON DELETE CASCADE,
  schedule_id       UUID REFERENCES operations.exam_schedules(id) ON DELETE SET NULL,
  score             NUMERIC(6,2),
  max_score         NUMERIC(6,2),
  taken_at          TIMESTAMPTZ,
  policy            TEXT NOT NULL DEFAULT 'higher'
    CHECK (policy IN ('higher', 'replace', 'average')),
  status            TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS operations.mark_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  exam_result_id  UUID NOT NULL REFERENCES operations.examresults(id) ON DELETE CASCADE,
  original_score  NUMERIC(6,2),
  new_score       NUMERIC(6,2),
  reason          TEXT NOT NULL,
  override_type   TEXT NOT NULL DEFAULT 'correction'
    CHECK (override_type IN ('correction', 'supplementary', 'appeal', 'moderation')),
  overridden_by   UUID NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  approved_by     UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS operations.grade_appeals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES student.students(id) ON DELETE CASCADE,
  exam_id         UUID NOT NULL REFERENCES operations.exams(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES academic.subjects(id) ON DELETE CASCADE,
  grounds         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'upheld', 'rejected')),
  resolution_notes TEXT,
  resolved_by     UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  resolved_at     TIMESTAMPTZ,
  due_at          TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Report cards (phase 9) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operations.report_cards (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES student.students(id) ON DELETE CASCADE,
  term_id       UUID NOT NULL REFERENCES academic.terms(id) ON DELETE CASCADE,
  class_id      UUID NOT NULL REFERENCES academic.classes(id) ON DELETE CASCADE,
  template_id   UUID,
  file_id       UUID,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'recalled')),
  generated_at  TIMESTAMPTZ,
  published_at  TIMESTAMPTZ,
  published_by  UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  scale_profile_id UUID REFERENCES operations.grading_scale_profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_report_card_student_term UNIQUE (student_id, term_id)
);

-- ─── Analytics snapshots (phase 10) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operations.analytics_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  term_id           UUID REFERENCES academic.terms(id) ON DELETE CASCADE,
  class_id          UUID REFERENCES academic.classes(id) ON DELETE CASCADE,
  subject_id        UUID REFERENCES academic.subjects(id) ON DELETE SET NULL,
  academic_year_id  UUID REFERENCES academic.academicyears(id) ON DELETE SET NULL,
  avg_score         NUMERIC(6,2),
  median_score      NUMERIC(6,2),
  pass_rate         NUMERIC(5,2),
  top_score         NUMERIC(6,2),
  lowest_score      NUMERIC(6,2),
  std_deviation     NUMERIC(6,2),
  student_count     INT NOT NULL DEFAULT 0,
  absent_count      INT NOT NULL DEFAULT 0,
  computation_run_id UUID REFERENCES operations.computation_runs(id) ON DELETE SET NULL,
  snapshot_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_lookup
  ON operations.analytics_snapshots(school_id, term_id, class_id, subject_id);

-- ─── Seed exam types + Ethiopian scale profile per school ─────────────────────
INSERT INTO operations.exam_types (school_id, code, name, default_weight_percent, sort_order)
SELECT s.id, v.code, v.name, v.weight, v.ord
FROM tenancy.schools s
CROSS JOIN (VALUES
  ('continuous_assessment', 'Continuous Assessment', 10, 1),
  ('quiz', 'Quiz', 10, 2),
  ('assignment', 'Assignment', 10, 3),
  ('midterm', 'Midterm', 30, 4),
  ('final', 'Final Exam', 40, 5),
  ('practical', 'Practical', 0, 6)
) AS v(code, name, weight, ord)
WHERE NOT EXISTS (SELECT 1 FROM operations.exam_types et WHERE et.school_id = s.id);

-- Default term weights (school-wide, subject_id NULL) for active terms — 10+10+10+30+40 = 100
INSERT INTO operations.term_assessment_weights (school_id, term_id, subject_id, exam_type_id, weight_percent)
SELECT ay.school_id, t.id, NULL, et.id, et.default_weight_percent
FROM academic.terms t
JOIN academic.academicyears ay ON ay.id = t.academic_year_id
JOIN operations.exam_types et ON et.school_id = ay.school_id AND et.counts_toward_term = true
WHERE et.default_weight_percent > 0
  AND NOT EXISTS (
    SELECT 1 FROM operations.term_assessment_weights taw
    WHERE taw.term_id = t.id AND taw.subject_id IS NULL AND taw.exam_type_id = et.id
  );

-- Grading scale profiles + link existing bands
INSERT INTO operations.grading_scale_profiles (school_id, name, scale_type, version, is_active, boundary_rule)
SELECT s.id, 'Ethiopian Standard', 'percentage', 1, true, 'inclusive_max'
FROM tenancy.schools s
WHERE NOT EXISTS (
  SELECT 1 FROM operations.grading_scale_profiles p
  WHERE p.school_id = s.id AND p.is_deleted = false
);

UPDATE operations.grading_scales gs
SET profile_id = p.id,
    letter_grade = COALESCE(gs.letter_grade, gs.label),
    display_label = COALESCE(gs.display_label, gs.description, gs.label),
    is_pass = CASE WHEN gs.label IN ('F', 'FX') OR gs.min_score < 50 THEN false ELSE true END
FROM operations.grading_scale_profiles p
WHERE gs.school_id = p.school_id AND gs.profile_id IS NULL AND p.is_active = true;

-- Ethiopian bands where school has no rows yet
INSERT INTO operations.grading_scales (
  school_id, profile_id, label, letter_grade, min_score, max_score, grade_points, sort_order, is_pass, display_label
)
SELECT p.school_id, p.id, v.letter, v.letter, v.min_s, v.max_s, v.gpa, v.ord, v.pass, v.lbl
FROM operations.grading_scale_profiles p
CROSS JOIN (VALUES
  ('A', 90, 100, 4.0, 1, true, 'Excellent'),
  ('B', 80, 89.99, 3.0, 2, true, 'Very Good'),
  ('C', 70, 79.99, 2.0, 3, true, 'Good'),
  ('D', 60, 69.99, 1.0, 4, true, 'Satisfactory'),
  ('F', 0, 59.99, 0.0, 5, false, 'Fail')
) AS v(letter, min_s, max_s, gpa, ord, pass, lbl)
WHERE p.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM operations.grading_scales gs WHERE gs.profile_id = p.id
  );

-- Sync exam_type_id on existing exams from code
UPDATE operations.exams e
SET exam_type_id = et.id
FROM operations.exam_types et
WHERE et.school_id = e.school_id AND et.code = e.exam_type AND e.exam_type_id IS NULL;
