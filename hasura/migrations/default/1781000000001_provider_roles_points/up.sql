-- Provider platform roles + point balance / claim workflow

CREATE SCHEMA IF NOT EXISTS platform;

INSERT INTO identity.roles (name, school_id)
SELECT 'PROVIDER_ADMIN', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM identity.roles WHERE name = 'PROVIDER_ADMIN' AND school_id IS NULL
);

INSERT INTO identity.roles (name, school_id)
SELECT 'SUPER_PROVIDER_ADMIN', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM identity.roles WHERE name = 'SUPER_PROVIDER_ADMIN' AND school_id IS NULL
);

CREATE TABLE IF NOT EXISTS platform.provider_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES identity.users(id) ON DELETE CASCADE,
  balance_points  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (balance_points >= 0),
  lifetime_earned NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (lifetime_earned >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform.point_claims (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_user_id  UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  points            NUMERIC(14,2) NOT NULL CHECK (points > 0),
  amount_etb        NUMERIC(14,2),
  status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'paid')),
  note              TEXT,
  provider_note     TEXT,
  reviewed_by       UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,
  review_note       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_point_claims_provider ON platform.point_claims(provider_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_point_claims_status ON platform.point_claims(status, created_at DESC);
