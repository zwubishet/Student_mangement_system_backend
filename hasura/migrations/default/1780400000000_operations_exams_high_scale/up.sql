-- High-scale operations: exams, schedules, enriched grade entries (examresults)
-- Maps user spec: school_id (not tenant_id), academic.* refs, student.students (not profiles)

-- ─── Extend operations.exams ───────────────────────────────────────────────────
ALTER TABLE operations.exams
  ADD COLUMN IF NOT EXISTS exam_type TEXT NOT NULL DEFAULT 'midterm',
  ADD COLUMN IF NOT EXISTS max_score NUMERIC(6,2) NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS pass_score NUMERIC(6,2) NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS exam_date DATE,
  ADD COLUMN IF NOT EXISTS instructions TEXT,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exams_exam_type_check'
  ) THEN
    ALTER TABLE operations.exams
      ADD CONSTRAINT exams_exam_type_check
      CHECK (exam_type IN ('midterm', 'final', 'quiz', 'assignment', 'practical'));
  END IF;
END $$;

-- weightage kept for backward compat; alias conceptually = weight_percent
COMMENT ON COLUMN operations.exams.weightage IS 'Weight percent contribution to term grade (0-100)';

CREATE INDEX IF NOT EXISTS idx_exams_school_term ON operations.exams(school_id, term_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_exams_status ON operations.exams(school_id, status) WHERE is_deleted = false;

-- ─── Per class + subject exam schedules ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operations.exam_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  exam_id         UUID NOT NULL REFERENCES operations.exams(id) ON DELETE CASCADE,
  class_id        UUID NOT NULL REFERENCES academic.classes(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES academic.subjects(id) ON DELETE CASCADE,
  max_score       NUMERIC(6,2),
  pass_score      NUMERIC(6,2),
  room            TEXT,
  start_time      TIMESTAMPTZ,
  end_time        TIMESTAMPTZ,
  invigilator_id  UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_exam_schedule_class_subject UNIQUE (exam_id, class_id, subject_id),
  CONSTRAINT chk_schedule_max_score CHECK (max_score IS NULL OR max_score > 0),
  CONSTRAINT chk_schedule_pass_score CHECK (pass_score IS NULL OR pass_score >= 0)
);

CREATE INDEX IF NOT EXISTS idx_exam_schedules_exam ON operations.exam_schedules(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_schedules_class ON operations.exam_schedules(class_id, subject_id);

-- ─── Enrich grade entries (operations.examresults — not operations.grades) ───
ALTER TABLE operations.examresults
  ADD COLUMN IF NOT EXISTS is_absent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS grade_points NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS teacher_notes TEXT,
  ADD COLUMN IF NOT EXISTS entered_by UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exam_id UUID REFERENCES operations.exams(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES academic.subjects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES academic.classes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES operations.exam_schedules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE operations.examresults
  DROP CONSTRAINT IF EXISTS examresults_score_check;

ALTER TABLE operations.examresults
  ADD CONSTRAINT examresults_score_check
  CHECK (score IS NULL OR (score >= 0 AND score <= 200));

CREATE INDEX IF NOT EXISTS idx_examresults_student_exam ON operations.examresults(student_id, exam_id);
CREATE INDEX IF NOT EXISTS idx_examresults_class_exam ON operations.examresults(class_id, exam_id);
CREATE INDEX IF NOT EXISTS idx_examresults_subject ON operations.examresults(subject_id, class_id);

-- Backfill denormalized columns on existing results
UPDATE operations.examresults er
SET
  exam_id = es.exam_id,
  subject_id = es.subject_id,
  entered_at = COALESCE(er.entered_at, now()),
  updated_at = now()
FROM operations.examsubjects es
WHERE er.exam_subject_id = es.id AND er.exam_id IS NULL;

UPDATE operations.examresults er
SET class_id = c.id
FROM operations.examsubjects es
JOIN academic.classes c ON c.section_id = es.section_id AND c.is_deleted = false
JOIN operations.exams e ON e.id = es.exam_id AND c.academic_year_id = (
  SELECT t.academic_year_id FROM academic.terms t WHERE t.id = e.term_id LIMIT 1
)
WHERE er.exam_subject_id = es.id AND er.class_id IS NULL;

-- Grading scales: GPA points optional
ALTER TABLE operations.grading_scales
  ADD COLUMN IF NOT EXISTS grade_points NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

-- Seed default school-wide scale rows where none exist (per school)
INSERT INTO operations.grading_scales (school_id, label, min_score, max_score, grade_points, sort_order)
SELECT s.id, v.label, v.min_score, v.max_score, v.gpa, v.ord
FROM tenancy.schools s
CROSS JOIN (VALUES
  ('A+', 90, 100, 4.0, 1),
  ('A', 85, 89.99, 3.7, 2),
  ('B+', 80, 84.99, 3.3, 3),
  ('B', 75, 79.99, 3.0, 4),
  ('C+', 70, 74.99, 2.7, 5),
  ('C', 50, 69.99, 2.0, 6),
  ('F', 0, 49.99, 0.0, 7)
) AS v(label, min_score, max_score, gpa, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM operations.grading_scales gs WHERE gs.school_id = s.id AND gs.exam_id IS NULL
);
