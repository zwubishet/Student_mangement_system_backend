DROP TABLE IF EXISTS finance.platform_billing_invoices;
DROP TABLE IF EXISTS finance.platform_commissions;
DROP TABLE IF EXISTS finance.financial_transactions;
ALTER TABLE finance.invoices
  DROP COLUMN IF EXISTS notes,
  DROP COLUMN IF EXISTS payment_plan_id,
  DROP COLUMN IF EXISTS total_paid,
  DROP COLUMN IF EXISTS discount_amount,
  DROP COLUMN IF EXISTS subtotal,
  DROP COLUMN IF EXISTS term,
  DROP COLUMN IF EXISTS academic_year;
DROP TABLE IF EXISTS finance.discount_rules;
DROP TABLE IF EXISTS finance.payment_plans;
DROP TABLE IF EXISTS finance.fee_schedules;
DROP TABLE IF EXISTS finance.fee_categories;
