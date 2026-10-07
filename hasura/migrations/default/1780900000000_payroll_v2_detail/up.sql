-- Payroll v2: detailed payslips, roster snapshots, pay dates

ALTER TABLE finance.payroll_runs
  ADD COLUMN IF NOT EXISTS pay_date DATE,
  ADD COLUMN IF NOT EXISTS employee_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'ETB';

ALTER TABLE finance.payroll_entries
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS staff_id_number TEXT,
  ADD COLUMN IF NOT EXISTS employment_type TEXT,
  ADD COLUMN IF NOT EXISTS contract_type TEXT,
  ADD COLUMN IF NOT EXISTS pay_frequency VARCHAR(20) DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS housing_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transport_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_allowances NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_withheld NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pension_employee NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_pay NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
  ADD COLUMN IF NOT EXISTS bank_branch TEXT,
  ADD COLUMN IF NOT EXISTS contract_salary_snapshot NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS payslip_ref VARCHAR(40);

CREATE INDEX IF NOT EXISTS idx_payroll_entries_staff
  ON finance.payroll_entries(school_id, staff_id);

-- Backfill gross from existing rows
UPDATE finance.payroll_entries
SET gross_pay = COALESCE(base_salary, 0) + COALESCE(allowances, 0)
WHERE gross_pay = 0 AND (base_salary > 0 OR allowances > 0);

UPDATE finance.payroll_runs pr
SET employee_count = sub.cnt
FROM (
  SELECT payroll_run_id, COUNT(*)::int AS cnt
  FROM finance.payroll_entries
  GROUP BY payroll_run_id
) sub
WHERE pr.id = sub.payroll_run_id;
