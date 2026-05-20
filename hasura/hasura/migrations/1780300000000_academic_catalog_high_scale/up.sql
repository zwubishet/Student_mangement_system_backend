-- High-scale academic catalog (academic schema; school_id = tenant_id)

-- ─── Academic years ───────────────────────────────────────────────────────────
ALTER TABLE academic.academicyears
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

UPDATE academic.academicyears
SET status = CASE
  WHEN status IN ('draft', 'active', 'closed') THEN status
  WHEN status = 'active' OR status IS NULL THEN 'active'
  ELSE 'draft'
END
WHERE status IS NULL OR status NOT IN ('draft', 'active', 'closed');

UPDATE academic.academicyears ay
SET is_current = true
WHERE is_deleted = false
  AND status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM academic.academicyears o
    WHERE o.school_id = ay.school_id AND o.is_current = true AND o.is_deleted = false AND o.id <> ay.id
  )
  AND ay.id = (
    SELECT id FROM academic.academicyears
    WHERE school_id = ay.school_id AND is_deleted = false AND status = 'active'
    ORDER BY start_date DESC LIMIT 1
  );

ALTER TABLE academic.academicyears DROP CONSTRAINT IF EXISTS chk_academicyear_dates;
ALTER TABLE academic.academicyears
  ADD CONSTRAINT chk_academicyear_dates CHECK (end_date > start_date);

-- One current year per school (same guarantee as EXCLUDE ... WHERE is_current)
CREATE UNIQUE INDEX IF NOT EXISTS uq_school_current_academic_year
  ON academic.academicyears(school_id)
  WHERE is_current = true AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_academic_years_school
  ON academic.academicyears(school_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_academic_years_current
  ON academic.academicyears(school_id, is_current) WHERE is_current = true AND is_deleted = false;

-- ─── Terms ────────────────────────────────────────────────────────────────────
ALTER TABLE academic.terms
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS term_number SMALLINT,
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'upcoming',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

UPDATE academic.terms t
SET school_id = ay.school_id
FROM academic.academicyears ay
WHERE ay.id = t.academic_year_id AND t.school_id IS NULL;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY academic_year_id ORDER BY start_date NULLS LAST)::smallint AS rn
  FROM academic.terms
)
UPDATE academic.terms t
SET term_number = n.rn
FROM numbered n
WHERE t.id = n.id AND t.term_number IS NULL;

UPDATE academic.terms SET term_number = 1 WHERE term_number IS NULL;

ALTER TABLE academic.terms DROP CONSTRAINT IF EXISTS chk_term_dates;
ALTER TABLE academic.terms
  ADD CONSTRAINT chk_term_dates CHECK (end_date > start_date);
ALTER TABLE academic.terms DROP CONSTRAINT IF EXISTS chk_term_status;
ALTER TABLE academic.terms
  ADD CONSTRAINT chk_term_status CHECK (status IN ('upcoming', 'active', 'closed'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_term_number_year
  ON academic.terms(academic_year_id, term_number)
  WHERE is_deleted = false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_year_current_term
  ON academic.terms(academic_year_id)
  WHERE is_current = true AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_terms_school ON academic.terms(school_id) WHERE is_deleted = false;

-- ─── Subjects (curriculum) ────────────────────────────────────────────────────
ALTER TABLE academic.subjects
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS is_core BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_subject_code_school
  ON academic.subjects(school_id, code)
  WHERE code IS NOT NULL AND code <> '' AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_subjects_school ON academic.subjects(school_id) WHERE is_deleted = false;

-- ─── Grade levels (academic.grades) ───────────────────────────────────────────
ALTER TABLE academic.grades
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY school_id ORDER BY COALESCE(level_order, 999), name)::int AS rn
  FROM academic.grades
)
UPDATE academic.grades g SET level_order = r.rn FROM ranked r WHERE g.id = r.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_grade_level_order_school
  ON academic.grades(school_id, level_order)
  WHERE level_order IS NOT NULL;

-- ─── Classes (year + grade placement) ─────────────────────────────────────────
ALTER TABLE academic.classes
  ADD COLUMN IF NOT EXISTS grade_level_id UUID REFERENCES academic.grades(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS room_number TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

UPDATE academic.classes SET grade_level_id = grade_id WHERE grade_level_id IS NULL AND grade_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_class_name_year_school
  ON academic.classes(school_id, academic_year_id, name)
  WHERE is_deleted = false AND name IS NOT NULL AND academic_year_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_classes_tenant_year
  ON academic.classes(school_id, academic_year_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_classes_grade_level
  ON academic.classes(grade_level_id) WHERE grade_level_id IS NOT NULL;

-- ─── Class ↔ subject matrix ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academic.class_subjects (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  class_id         UUID NOT NULL REFERENCES academic.classes(id) ON DELETE CASCADE,
  subject_id       UUID NOT NULL REFERENCES academic.subjects(id) ON DELETE CASCADE,
  periods_per_week SMALLINT NOT NULL DEFAULT 5,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_class_subject UNIQUE (class_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_class_subjects_class ON academic.class_subjects(class_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_school ON academic.class_subjects(school_id);

-- ─── Timetable slots (period-level attendance) ────────────────────────────────
CREATE TABLE IF NOT EXISTS academic.timetable_slots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  class_id      UUID NOT NULL REFERENCES academic.classes(id) ON DELETE CASCADE,
  subject_id    UUID NOT NULL REFERENCES academic.subjects(id) ON DELETE CASCADE,
  teacher_id    UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  day_of_week   SMALLINT NOT NULL,
  period_number SMALLINT NOT NULL,
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_class_timetable_slot UNIQUE (class_id, day_of_week, period_number),
  CONSTRAINT chk_timetable_day CHECK (day_of_week BETWEEN 1 AND 6),
  CONSTRAINT chk_timetable_time CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_timetable_class ON academic.timetable_slots(class_id);
CREATE INDEX IF NOT EXISTS idx_timetable_teacher ON academic.timetable_slots(teacher_id) WHERE teacher_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_timetable_school ON academic.timetable_slots(school_id);

-- Sync timestamps on academic years
CREATE OR REPLACE FUNCTION academic.sync_academic_year_meta()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.is_current AND NEW.is_deleted = false THEN
    UPDATE academic.academicyears
    SET is_current = false, updated_at = now()
    WHERE school_id = NEW.school_id AND id <> NEW.id AND is_current = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_academic_year_sync ON academic.academicyears;
CREATE TRIGGER trg_academic_year_sync
  BEFORE INSERT OR UPDATE ON academic.academicyears
  FOR EACH ROW EXECUTE FUNCTION academic.sync_academic_year_meta();
