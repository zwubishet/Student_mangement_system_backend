-- Per-student fee subscriptions (Ethiopia: transport, meals, tuition tiers — not grade-only billing)

ALTER TABLE finance.fee_categories
  ADD COLUMN IF NOT EXISTS category_type VARCHAR(24) NOT NULL DEFAULT 'optional',
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS default_amount NUMERIC(12,2) CHECK (default_amount IS NULL OR default_amount >= 0);

COMMENT ON COLUMN finance.fee_categories.category_type IS
  'mandatory = auto-subscribe all students; optional = student opts in (e.g. transport)';

ALTER TABLE finance.fee_categories
  DROP CONSTRAINT IF EXISTS fee_categories_category_type_chk;

ALTER TABLE finance.fee_categories
  ADD CONSTRAINT fee_categories_category_type_chk
  CHECK (category_type IN ('mandatory', 'optional'));

ALTER TABLE finance.fee_categories
  DROP CONSTRAINT IF EXISTS fee_categories_frequency_chk;

ALTER TABLE finance.fee_categories
  ADD CONSTRAINT fee_categories_frequency_chk
  CHECK (frequency IN ('annual', 'term', 'monthly', 'one_time'));

CREATE TABLE IF NOT EXISTS finance.student_fee_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES student.students(id) ON DELETE CASCADE,
  fee_category_id UUID NOT NULL REFERENCES finance.fee_categories(id) ON DELETE CASCADE,
  academic_year   VARCHAR(9) NOT NULL,
  custom_amount   NUMERIC(12,2) CHECK (custom_amount IS NULL OR custom_amount >= 0),
  frequency       VARCHAR(20),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT,
  created_by      UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, student_id, fee_category_id, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_student_fee_assign_school_year
  ON finance.student_fee_assignments (school_id, academic_year) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_student_fee_assign_student
  ON finance.student_fee_assignments (student_id, academic_year);

ALTER TABLE finance.invoiceitems
  ADD COLUMN IF NOT EXISTS fee_category_id UUID REFERENCES finance.fee_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fee_schedule_id UUID REFERENCES finance.fee_schedules(id) ON DELETE SET NULL;

-- Finance officer → school admin HR review handoff
CREATE TABLE IF NOT EXISTS finance.staff_hr_review_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  teacher_id    UUID NOT NULL REFERENCES academic.teachers(id) ON DELETE CASCADE,
  requested_by  UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',
  message       TEXT,
  snapshot      JSONB NOT NULL DEFAULT '{}',
  admin_note    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at   TIMESTAMPTZ,
  reviewed_by   UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  CONSTRAINT staff_hr_review_status_chk CHECK (status IN ('pending', 'reviewed', 'dismissed'))
);

CREATE INDEX IF NOT EXISTS idx_staff_hr_review_pending
  ON finance.staff_hr_review_requests (school_id, status) WHERE status = 'pending';
