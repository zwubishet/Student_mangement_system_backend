DROP TABLE IF EXISTS finance.payroll_entries;
DROP TABLE IF EXISTS finance.payroll_runs;
DELETE FROM identity.roles WHERE name = 'FINANCE' AND school_id IS NULL;
