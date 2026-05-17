-- Audit log table for tracking all mutations
CREATE TABLE IF NOT EXISTS identity.audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID,
  school_id   UUID NOT NULL,
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT,
  meta        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_school ON identity.audit_logs(school_id, created_at DESC);

-- School settings (extends tenancy.schools)
CREATE TABLE IF NOT EXISTS tenancy.school_settings (
  school_id                   UUID PRIMARY KEY REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  phone                       TEXT,
  email                       TEXT,
  logo_url                    TEXT,
  timezone                    TEXT DEFAULT 'UTC',
  academic_year_format        TEXT DEFAULT 'YYYY-YYYY',
  allow_student_self_register BOOLEAN DEFAULT FALSE,
  max_students_per_class      INT DEFAULT 40,
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- Grade scales per school
CREATE TABLE IF NOT EXISTS academic.grade_scales (
  id            SERIAL PRIMARY KEY,
  school_id     UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  min_score     NUMERIC(5,2) NOT NULL,
  max_score     NUMERIC(5,2) NOT NULL,
  grade_letter  TEXT NOT NULL,
  gpa_points    NUMERIC(3,2),
  description   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_grade_scales_school ON academic.grade_scales(school_id);

-- Add updated_at to students if missing
ALTER TABLE student.students ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
