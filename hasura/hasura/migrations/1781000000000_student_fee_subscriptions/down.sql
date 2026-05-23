DROP TABLE IF EXISTS finance.staff_hr_review_requests;
DROP TABLE IF EXISTS finance.student_fee_assignments;
ALTER TABLE finance.invoiceitems DROP COLUMN IF EXISTS fee_category_id;
ALTER TABLE finance.invoiceitems DROP COLUMN IF EXISTS fee_schedule_id;
ALTER TABLE finance.fee_categories DROP COLUMN IF EXISTS category_type;
ALTER TABLE finance.fee_categories DROP COLUMN IF EXISTS description;
ALTER TABLE finance.fee_categories DROP COLUMN IF EXISTS default_amount;
