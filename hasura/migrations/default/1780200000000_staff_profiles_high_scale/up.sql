-- High-scale staff/teacher domain (identity.staff_profiles; school_id = tenant_id)

DO $$ BEGIN
  CREATE TYPE identity.employment_type AS ENUM ('permanent', 'contract', 'part_time', 'substitute');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE identity.highest_degree AS ENUM ('certificate', 'diploma', 'bachelor', 'masters', 'phd');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE identity.appraisal_rating AS ENUM (
    'excellent', 'good', 'satisfactory', 'needs_improvement', 'unsatisfactory'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Staff profiles (source of truth for teacher HR data) ───────────────────
CREATE TABLE IF NOT EXISTS identity.staff_profiles (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id                 UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  user_id                   UUID NOT NULL UNIQUE REFERENCES identity.users(id) ON DELETE CASCADE,

  staff_id_number           TEXT NOT NULL,
  hire_date                 DATE NOT NULL,
  employment_type           identity.employment_type NOT NULL DEFAULT 'permanent',
  department                TEXT,
  teaching_licence_number   TEXT,
  licence_expiry_date       DATE,
  specialisation_subjects   TEXT[] NOT NULL DEFAULT '{}',

  date_of_birth             DATE,
  gender                    TEXT,
  nationality               TEXT DEFAULT 'Ethiopian',
  religion                  TEXT,
  photo_url                 TEXT,
  home_address              TEXT,
  city                      TEXT,
  region                    TEXT,
  emergency_contact_name    TEXT,
  emergency_contact_phone   TEXT,
  emergency_contact_rel     TEXT,

  highest_degree            identity.highest_degree,
  degree_subject            TEXT,
  university_name           TEXT,
  graduation_year           SMALLINT,
  years_of_experience       SMALLINT NOT NULL DEFAULT 0,
  additional_certifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  previous_schools          JSONB NOT NULL DEFAULT '[]'::jsonb,

  bank_name                 TEXT,
  bank_account_number       TEXT,
  bank_branch               TEXT,
  tax_identification_number TEXT,
  pension_number            TEXT,
  payment_method            TEXT NOT NULL DEFAULT 'bank_transfer',

  is_active                 BOOLEAN NOT NULL DEFAULT true,
  termination_date          DATE,
  termination_reason        TEXT,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  is_deleted                BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT uq_staff_id_school UNIQUE (school_id, staff_id_number),
  CONSTRAINT chk_staff_termination CHECK (
    termination_date IS NULL OR (is_active = false AND termination_date IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_staff_tenant
  ON identity.staff_profiles(school_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_staff_user ON identity.staff_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_licence_exp
  ON identity.staff_profiles(licence_expiry_date)
  WHERE licence_expiry_date IS NOT NULL AND is_active = true AND is_deleted = false;

-- Link academic.teachers → staff profile
ALTER TABLE academic.teachers
  ADD COLUMN IF NOT EXISTS staff_profile_id UUID REFERENCES identity.staff_profiles(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_teachers_staff_profile
  ON academic.teachers(staff_profile_id) WHERE staff_profile_id IS NOT NULL;

-- Backfill staff_profiles from existing teachers
INSERT INTO identity.staff_profiles (
  school_id, user_id, staff_id_number, hire_date, employment_type, department,
  home_address, is_active, is_deleted, created_at
)
SELECT
  t.school_id,
  t.user_id,
  'STAFF-' || upper(left(replace(t.id::text, '-', ''), 8)),
  COALESCE(t.hire_date, t.created_at::date, CURRENT_DATE),
  CASE lower(COALESCE(t.employment_type, 'full_time'))
    WHEN 'part_time' THEN 'part_time'::identity.employment_type
    WHEN 'contract' THEN 'contract'::identity.employment_type
    WHEN 'substitute' THEN 'substitute'::identity.employment_type
    ELSE 'permanent'::identity.employment_type
  END,
  t.department,
  t.address,
  COALESCE(t.status, 'active') = 'active' AND t.deleted_at IS NULL,
  t.deleted_at IS NOT NULL OR t.status = 'deleted',
  COALESCE(t.created_at, now())
FROM academic.teachers t
WHERE t.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM identity.staff_profiles sp WHERE sp.user_id = t.user_id)
ON CONFLICT (user_id) DO NOTHING;

UPDATE academic.teachers t
SET staff_profile_id = sp.id
FROM identity.staff_profiles sp
WHERE sp.user_id = t.user_id AND t.staff_profile_id IS NULL;

-- Annual contracts
CREATE TABLE IF NOT EXISTS identity.staff_contracts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  staff_id            UUID NOT NULL REFERENCES identity.staff_profiles(id) ON DELETE CASCADE,
  academic_year_id    UUID NOT NULL REFERENCES academic.academicyears(id) ON DELETE RESTRICT,
  contract_type       TEXT NOT NULL,
  salary_amount       NUMERIC(12,2),
  currency            TEXT NOT NULL DEFAULT 'ETB',
  start_date          DATE NOT NULL,
  end_date            DATE,
  signed_at           TIMESTAMPTZ,
  signed_document_url TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  CONSTRAINT uq_staff_contract_year UNIQUE (staff_id, academic_year_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_contracts_staff ON identity.staff_contracts(staff_id);

-- Leave
CREATE TABLE IF NOT EXISTS identity.staff_leave (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  staff_id          UUID NOT NULL REFERENCES identity.staff_profiles(id) ON DELETE CASCADE,
  leave_type        TEXT NOT NULL,
  from_date         DATE NOT NULL,
  to_date           DATE NOT NULL,
  days_count        SMALLINT NOT NULL,
  reason            TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',
  approved_by       UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  approved_at       TIMESTAMPTZ,
  rejection_reason  TEXT,
  substitute_id     UUID REFERENCES identity.staff_profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_leave_dates CHECK (to_date >= from_date),
  CONSTRAINT chk_leave_type CHECK (
    leave_type IN ('annual','sick','maternity','paternity','bereavement','study','unpaid')
  ),
  CONSTRAINT chk_leave_status CHECK (
    status IN ('pending','approved','rejected','cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_leave_staff ON identity.staff_leave(staff_id, from_date DESC);
CREATE INDEX IF NOT EXISTS idx_leave_pending ON identity.staff_leave(school_id, status) WHERE status = 'pending';

-- Appraisals
CREATE TABLE IF NOT EXISTS identity.staff_appraisals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  staff_id          UUID NOT NULL REFERENCES identity.staff_profiles(id) ON DELETE CASCADE,
  academic_year_id  UUID NOT NULL REFERENCES academic.academicyears(id) ON DELETE RESTRICT,
  appraisal_date    DATE NOT NULL,
  appraised_by      UUID NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  scores            JSONB NOT NULL DEFAULT '{}'::jsonb,
  overall_rating    identity.appraisal_rating NOT NULL,
  strengths         TEXT,
  areas_to_improve  TEXT,
  action_plan       TEXT,
  teacher_response  TEXT,
  teacher_signed_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_appraisals_staff ON identity.staff_appraisals(staff_id, appraisal_date DESC);

-- CPD
CREATE TABLE IF NOT EXISTS identity.staff_cpd (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  staff_id        UUID NOT NULL REFERENCES identity.staff_profiles(id) ON DELETE CASCADE,
  activity_name   TEXT NOT NULL,
  provider        TEXT,
  category        TEXT,
  activity_date   DATE NOT NULL,
  hours           NUMERIC(5,2) NOT NULL,
  certificate_url TEXT,
  verified        BOOLEAN NOT NULL DEFAULT false,
  verified_by     UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_cpd_staff ON identity.staff_cpd(staff_id, activity_date DESC);

-- Sync trigger: staff_profiles ↔ academic.teachers denormalized fields
CREATE OR REPLACE FUNCTION identity.sync_staff_teacher_denorm()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE academic.teachers SET
    department = NEW.department,
    employment_type = NEW.employment_type::text,
    hire_date = NEW.hire_date,
    address = COALESCE(NEW.home_address, address),
    updated_at = NOW(),
    status = CASE
      WHEN NEW.is_deleted OR NOT NEW.is_active THEN 'suspended'
      WHEN status = 'archived' THEN status
      ELSE 'active'
    END
  WHERE staff_profile_id = NEW.id OR user_id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_staff_sync_teacher ON identity.staff_profiles;
CREATE TRIGGER trg_staff_sync_teacher
  AFTER INSERT OR UPDATE ON identity.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION identity.sync_staff_teacher_denorm();
