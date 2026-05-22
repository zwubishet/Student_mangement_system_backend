ALTER TABLE finance.payroll_entries
  DROP COLUMN IF EXISTS payslip_ref,
  DROP COLUMN IF EXISTS contract_salary_snapshot,
  DROP COLUMN IF EXISTS bank_branch,
  DROP COLUMN IF EXISTS bank_account_number,
  DROP COLUMN IF EXISTS bank_name,
  DROP COLUMN IF EXISTS gross_pay,
  DROP COLUMN IF EXISTS other_deductions,
  DROP COLUMN IF EXISTS pension_employee,
  DROP COLUMN IF EXISTS tax_withheld,
  DROP COLUMN IF EXISTS other_allowances,
  DROP COLUMN IF EXISTS transport_allowance,
  DROP COLUMN IF EXISTS housing_allowance,
  DROP COLUMN IF EXISTS pay_frequency,
  DROP COLUMN IF EXISTS contract_type,
  DROP COLUMN IF EXISTS employment_type,
  DROP COLUMN IF EXISTS staff_id_number,
  DROP COLUMN IF EXISTS department,
  DROP COLUMN IF EXISTS job_title;

ALTER TABLE finance.payroll_runs
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS employee_count,
  DROP COLUMN IF EXISTS pay_date;

DROP INDEX IF EXISTS finance.idx_payroll_entries_staff;
