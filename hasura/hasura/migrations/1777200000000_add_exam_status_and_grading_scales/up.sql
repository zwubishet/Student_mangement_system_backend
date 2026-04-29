-- Add status to operations.exams
-- DRAFT -> ACTIVE -> COMPLETED -> PUBLISHED
ALTER TABLE operations.exams
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'DRAFT'
  CHECK (status IN ('DRAFT', 'ACTIVE', 'COMPLETED', 'PUBLISHED'));

-- Grading scales table (school-wide or exam-specific)
CREATE TABLE IF NOT EXISTS operations.grading_scales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  exam_id UUID REFERENCES operations.exams(id) ON DELETE CASCADE,
  label TEXT NOT NULL,          -- e.g. 'A', 'B+', 'Pass'
  min_score NUMERIC NOT NULL,
  max_score NUMERIC NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT grading_scales_range_check CHECK (min_score <= max_score)
);

CREATE INDEX IF NOT EXISTS idx_grading_scales_school ON operations.grading_scales(school_id);
CREATE INDEX IF NOT EXISTS idx_grading_scales_exam ON operations.grading_scales(exam_id);
