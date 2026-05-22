DROP TABLE IF EXISTS finance.fee_generation_requests;
ALTER TABLE finance.payroll_runs
  DROP COLUMN IF EXISTS submitted_at,
  DROP COLUMN IF EXISTS submitted_by,
  DROP COLUMN IF EXISTS rejected_at,
  DROP COLUMN IF EXISTS rejected_by,
  DROP COLUMN IF EXISTS rejection_reason;
ALTER TABLE finance.payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_status_chk;
ALTER TABLE finance.payroll_runs ADD CONSTRAINT payroll_runs_status_chk CHECK (
  status IN ('draft', 'approved', 'paid', 'cancelled')
);
