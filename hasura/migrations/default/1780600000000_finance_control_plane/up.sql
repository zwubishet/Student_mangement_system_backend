-- School finance v2 + platform revenue (Flow 1 + Flow 2 separated)

CREATE TABLE IF NOT EXISTS finance.fee_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,
  code          VARCHAR(40),
  is_mandatory  BOOLEAN NOT NULL DEFAULT true,
  frequency     VARCHAR(20) NOT NULL DEFAULT 'term',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS finance.fee_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  fee_category_id UUID NOT NULL REFERENCES finance.fee_categories(id) ON DELETE CASCADE,
  grade_id        UUID REFERENCES academic.grades(id) ON DELETE SET NULL,
  academic_year   VARCHAR(9) NOT NULL,
  term            SMALLINT,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency        CHAR(3) NOT NULL DEFAULT 'ETB',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, fee_category_id, grade_id, academic_year, term)
);

CREATE TABLE IF NOT EXISTS finance.payment_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  name          VARCHAR(80) NOT NULL,
  plan_type     VARCHAR(20) NOT NULL DEFAULT 'full',
  installments  SMALLINT NOT NULL DEFAULT 1,
  is_default    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS finance.discount_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  type        VARCHAR(20) NOT NULL CHECK (type IN ('percentage', 'fixed')),
  value       NUMERIC(8,2) NOT NULL CHECK (value >= 0),
  applies_to  VARCHAR(20) NOT NULL DEFAULT 'all',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE finance.invoices
  ADD COLUMN IF NOT EXISTS academic_year VARCHAR(9),
  ADD COLUMN IF NOT EXISTS term SMALLINT,
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_paid NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_plan_id UUID REFERENCES finance.payment_plans(id),
  ADD COLUMN IF NOT EXISTS notes TEXT;

UPDATE finance.invoices
SET subtotal = amount, total_paid = 0
WHERE subtotal IS NULL;

-- Immutable ledger (insert-only)
CREATE TABLE IF NOT EXISTS finance.financial_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  invoice_id      UUID REFERENCES finance.invoices(id) ON DELETE SET NULL,
  student_id      UUID REFERENCES student.students(id) ON DELETE SET NULL,
  payment_id      UUID REFERENCES finance.payments(id) ON DELETE SET NULL,
  type            VARCHAR(30) NOT NULL,
  method          VARCHAR(30) NOT NULL,
  amount          NUMERIC(12,2) NOT NULL,
  currency        CHAR(3) NOT NULL DEFAULT 'ETB',
  chapa_tx_ref    VARCHAR(100),
  idempotency_key VARCHAR(160),
  recorded_by     UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  notes           TEXT,
  meta            JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT financial_transactions_type_chk CHECK (
    type IN ('payment', 'refund', 'adjustment', 'waiver', 'commission')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_tx_chapa_ref
  ON finance.financial_transactions(chapa_tx_ref) WHERE chapa_tx_ref IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_tx_idempotency
  ON finance.financial_transactions(school_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Platform revenue (Flow 2) — never mixed with student ledger rows in reports
CREATE TABLE IF NOT EXISTS finance.platform_commissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  source_tx_id    UUID REFERENCES finance.financial_transactions(id) ON DELETE SET NULL,
  gross_amount    NUMERIC(12,2) NOT NULL,
  commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.0150,
  commission_etb  NUMERIC(10,2) NOT NULL,
  settled         BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance.platform_billing_invoices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  subscription  NUMERIC(10,2) NOT NULL DEFAULT 0,
  sms_charges   NUMERIC(10,2) NOT NULL DEFAULT 0,
  commission    NUMERIC(10,2) NOT NULL DEFAULT 0,
  total         NUMERIC(10,2) NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',
  paid_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_categories_school ON finance.fee_categories(school_id);
CREATE INDEX IF NOT EXISTS idx_fee_schedules_school_year ON finance.fee_schedules(school_id, academic_year);
CREATE INDEX IF NOT EXISTS idx_financial_tx_school_created ON finance.financial_transactions(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_tx_student ON finance.financial_transactions(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_commissions_school ON finance.platform_commissions(school_id, created_at DESC);
