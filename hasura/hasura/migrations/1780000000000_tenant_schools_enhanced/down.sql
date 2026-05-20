DROP TRIGGER IF EXISTS trg_schools_sync_address ON tenancy.schools;
DROP FUNCTION IF EXISTS tenancy.sync_school_address();
DROP TABLE IF EXISTS tenancy.feature_flags;

ALTER TABLE tenancy.schools DROP CONSTRAINT IF EXISTS chk_schools_grading_system;
ALTER TABLE tenancy.schools DROP CONSTRAINT IF EXISTS chk_schools_year_start_month;
ALTER TABLE tenancy.schools DROP CONSTRAINT IF EXISTS chk_schools_slug_format;

DROP INDEX IF EXISTS tenancy.idx_schools_plan;
DROP INDEX IF EXISTS tenancy.idx_schools_slug;
DROP INDEX IF EXISTS tenancy.idx_schools_status;
DROP INDEX IF EXISTS tenancy.idx_schools_slug_unique;

ALTER TABLE tenancy.schools ALTER COLUMN status TYPE TEXT USING status::text;
ALTER TABLE tenancy.schools ALTER COLUMN plan TYPE TEXT USING plan::text;

ALTER TABLE tenancy.schools
  DROP COLUMN IF EXISTS slug,
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS phone,
  DROP COLUMN IF EXISTS address,
  DROP COLUMN IF EXISTS city,
  DROP COLUMN IF EXISTS region,
  DROP COLUMN IF EXISTS country,
  DROP COLUMN IF EXISTS logo_url,
  DROP COLUMN IF EXISTS timezone,
  DROP COLUMN IF EXISTS locale,
  DROP COLUMN IF EXISTS academic_year_start_month,
  DROP COLUMN IF EXISTS grading_system,
  DROP COLUMN IF EXISTS max_class_size,
  DROP COLUMN IF EXISTS trial_ends_at,
  DROP COLUMN IF EXISTS subscription_starts_at,
  DROP COLUMN IF EXISTS subscription_ends_at,
  DROP COLUMN IF EXISTS chapa_customer_id,
  DROP COLUMN IF EXISTS chapa_subscription_id,
  DROP COLUMN IF EXISTS provisioned_at,
  DROP COLUMN IF EXISTS provisioned_by,
  DROP COLUMN IF EXISTS suspended_at,
  DROP COLUMN IF EXISTS suspended_reason,
  DROP COLUMN IF EXISTS settings,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS is_deleted;

DROP TYPE IF EXISTS tenancy.subscription_plan;
DROP TYPE IF EXISTS tenancy.school_status;
