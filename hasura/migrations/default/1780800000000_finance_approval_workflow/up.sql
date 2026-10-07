-- Payroll approval workflow + fee generation requests

ALTER TABLE finance.payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_status_chk;
ALTER TABLE finance.payroll_runs ADD CONSTRAINT payroll_runs_status_chk CHECK (
  status IN ('draft', 'pending_approval', 'approved', 'paid', 'rejected', 'cancelled')
);

ALTER TABLE finance.payroll_runs
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE TABLE IF NOT EXISTS finance.fee_generation_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  academic_year     VARCHAR(9) NOT NULL,
  term              SMALLINT,
  grade_id          UUID REFERENCES academic.grades(id) ON DELETE SET NULL,
  due_date          DATE,
  discount_rule_id  UUID REFERENCES finance.discount_rules(id) ON DELETE SET NULL,
  payment_plan_id   UUID,
  status            VARCHAR(24) NOT NULL DEFAULT 'pending_approval',
  generated_count   INT,
  students_count    INT,
  notes             TEXT,
  created_by        UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  approved_by       UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  rejected_by       UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  rejection_reason  TEXT,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fee_generation_requests_status_chk CHECK (
    status IN ('pending_approval', 'approved', 'rejected', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_fee_gen_requests_school
  ON finance.fee_generation_requests(school_id, status, submitted_at DESC);
