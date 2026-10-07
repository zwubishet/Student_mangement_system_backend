-- Enhanced tenant record on tenancy.schools (logical "tenants" = tenancy schema)
-- Aligns with SaaS provisioning: slug, trial, billing, feature flags, soft delete

DO $$ BEGIN
  CREATE TYPE tenancy.school_status AS ENUM (
    'pending', 'active', 'suspended', 'inactive', 'trial_expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tenancy.subscription_plan AS ENUM (
    'trial', 'standard', 'professional', 'enterprise'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- New columns (safe IF NOT EXISTS)
ALTER TABLE tenancy.schools ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE tenancy.schools ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE tenancy.schools ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE tenancy.schools ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE tenancy.schools ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE tenancy.schools ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE tenancy.schools ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'ET';
ALTER TABLE tenancy.schools ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE tenancy.schools ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Africa/Addis_Ababa';
ALTER TABLE tenancy.schools ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en';
ALTER TABLE tenancy.schools ADD COLUMN IF NOT EXISTS academic_year_start_month SMALLINT DEFAULT 9;
ALTER TABLE tenancy.schools ADD COLUMN IF NOT EXISTS grading_system TEXT NOT NULL DEFAULT 'percentage';
ALTER TABLE tenancy.schools ADD COLUMN IF NOT EXISTS max_class_size SMALLINT DEFAULT 45;
ALTER TABLE tenancy.schools ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE tenancy.schools ADD COLUMN IF NOT EXISTS subscription_starts_at TIMESTAMPTZ;
ALTER TABLE tenancy.schools ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ;
ALTER TABLE tenancy.schools ADD COLUMN IF NOT EXISTS chapa_customer_id TEXT;
ALTER TABLE tenancy.schools ADD COLUMN IF NOT EXISTS chapa_subscription_id TEXT;
ALTER TABLE tenancy.schools ADD COLUMN IF NOT EXISTS provisioned_at TIMESTAMPTZ;
ALTER TABLE tenancy.schools ADD COLUMN IF NOT EXISTS provisioned_by UUID REFERENCES identity.users(id) ON DELETE SET NULL;
ALTER TABLE tenancy.schools ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE tenancy.schools ADD COLUMN IF NOT EXISTS suspended_reason TEXT;
ALTER TABLE tenancy.schools ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';
ALTER TABLE tenancy.schools ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE tenancy.schools ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

-- Backfill address from legacy school_address
UPDATE tenancy.schools
SET address = COALESCE(address, school_address)
WHERE address IS NULL AND school_address IS NOT NULL;

-- Backfill slug from name or domain
UPDATE tenancy.schools
SET slug = COALESCE(
  NULLIF(lower(regexp_replace(COALESCE(domain, ''), '[^a-z0-9]+', '-', 'g')), ''),
  lower(regexp_replace(regexp_replace(trim(name), '[^a-zA-Z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g'))
)
WHERE slug IS NULL OR slug = '';

-- Ensure unique slugs (append id suffix on collision)
UPDATE tenancy.schools s
SET slug = left(s.slug, 40) || '-' || left(replace(s.id::text, '-', ''), 8)
WHERE EXISTS (
  SELECT 1 FROM tenancy.schools s2
  WHERE s2.slug = s.slug AND s2.id <> s.id AND s2.is_deleted = false
);

-- Trial window for existing active schools without dates
UPDATE tenancy.schools
SET trial_ends_at = COALESCE(trial_ends_at, created_at + INTERVAL '30 days')
WHERE id != '00000000-0000-0000-0000-000000000001'
  AND trial_ends_at IS NULL;

UPDATE tenancy.schools
SET provisioned_at = COALESCE(provisioned_at, created_at)
WHERE id != '00000000-0000-0000-0000-000000000001';

-- Convert plan text → enum (default trial)
ALTER TABLE tenancy.schools
  ALTER COLUMN plan DROP DEFAULT;
ALTER TABLE tenancy.schools
  ALTER COLUMN plan TYPE tenancy.subscription_plan
  USING (
    CASE lower(COALESCE(plan::text, 'trial'))
      WHEN 'standard' THEN 'standard'::tenancy.subscription_plan
      WHEN 'professional' THEN 'professional'::tenancy.subscription_plan
      WHEN 'enterprise' THEN 'enterprise'::tenancy.subscription_plan
      WHEN 'platform' THEN 'enterprise'::tenancy.subscription_plan
      ELSE 'trial'::tenancy.subscription_plan
    END
  );
ALTER TABLE tenancy.schools
  ALTER COLUMN plan SET DEFAULT 'trial'::tenancy.subscription_plan;

-- Convert status text → enum
ALTER TABLE tenancy.schools
  ALTER COLUMN status DROP DEFAULT;
ALTER TABLE tenancy.schools
  ALTER COLUMN status TYPE tenancy.school_status
  USING (
    CASE lower(COALESCE(status::text, 'active'))
      WHEN 'pending' THEN 'pending'::tenancy.school_status
      WHEN 'suspended' THEN 'suspended'::tenancy.school_status
      WHEN 'inactive' THEN 'inactive'::tenancy.school_status
      WHEN 'trial_expired' THEN 'trial_expired'::tenancy.school_status
      ELSE 'active'::tenancy.school_status
    END
  );
ALTER TABLE tenancy.schools
  ALTER COLUMN status SET DEFAULT 'pending'::tenancy.school_status;

-- Platform system school stays active
UPDATE tenancy.schools
SET status = 'active'::tenancy.school_status,
    plan = 'enterprise'::tenancy.subscription_plan,
    slug = 'edumanage-platform'
WHERE id = '00000000-0000-0000-0000-000000000001';

ALTER TABLE tenancy.schools
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_schools_slug_unique
  ON tenancy.schools(slug) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_schools_status ON tenancy.schools(status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_schools_slug ON tenancy.schools(slug);
CREATE INDEX IF NOT EXISTS idx_schools_plan ON tenancy.schools(plan, status);

ALTER TABLE tenancy.schools
  ADD CONSTRAINT chk_schools_slug_format CHECK (slug ~ '^[a-z0-9-]+$');
ALTER TABLE tenancy.schools
  ADD CONSTRAINT chk_schools_year_start_month CHECK (academic_year_start_month BETWEEN 1 AND 12);
ALTER TABLE tenancy.schools
  ADD CONSTRAINT chk_schools_grading_system CHECK (grading_system IN ('percentage', 'gpa', 'letter'));

-- Feature flags per tenant
CREATE TABLE IF NOT EXISTS tenancy.feature_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  feature     TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  enabled_at  TIMESTAMPTZ,
  enabled_by  UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_feature UNIQUE (tenant_id, feature)
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_tenant ON tenancy.feature_flags(tenant_id);

-- Keep legacy school_address in sync when address changes
CREATE OR REPLACE FUNCTION tenancy.sync_school_address()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.address IS DISTINCT FROM OLD.address OR TG_OP = 'INSERT' THEN
    NEW.school_address := NEW.address;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_schools_sync_address ON tenancy.schools;
CREATE TRIGGER trg_schools_sync_address
  BEFORE INSERT OR UPDATE ON tenancy.schools
  FOR EACH ROW EXECUTE FUNCTION tenancy.sync_school_address();
