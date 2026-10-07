-- FINANCE officer role + payroll runs

INSERT INTO identity.roles (name, school_id)
SELECT 'FINANCE', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM identity.roles WHERE name = 'FINANCE' AND school_id IS NULL
);

CREATE TABLE IF NOT EXISTS finance.payroll_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  academic_year   VARCHAR(9),
  period_label    VARCHAR(80) NOT NULL,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'draft',
  total_gross     NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_net       NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  created_by      UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  approved_by     UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payroll_runs_status_chk CHECK (status IN ('draft', 'approved', 'paid', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS finance.payroll_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id  UUID NOT NULL REFERENCES finance.payroll_runs(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  staff_id        UUID NOT NULL REFERENCES identity.staff_profiles(id) ON DELETE CASCADE,
  teacher_id      UUID REFERENCES academic.teachers(id) ON DELETE SET NULL,
  employee_name   TEXT NOT NULL,
  base_salary     NUMERIC(12,2) NOT NULL DEFAULT 0,
  allowances      NUMERIC(12,2) NOT NULL DEFAULT 0,
  deductions      NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_pay         NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method  VARCHAR(30) DEFAULT 'bank_transfer',
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  paid_at         TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payroll_entries_status_chk CHECK (status IN ('pending', 'paid', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_school ON finance.payroll_runs(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_run ON finance.payroll_entries(payroll_run_id);

ALTER TABLE finance.financial_transactions DROP CONSTRAINT IF EXISTS financial_transactions_type_chk;
ALTER TABLE finance.financial_transactions ADD CONSTRAINT financial_transactions_type_chk CHECK (
  type IN ('payment', 'refund', 'adjustment', 'waiver', 'commission', 'payroll')
);
