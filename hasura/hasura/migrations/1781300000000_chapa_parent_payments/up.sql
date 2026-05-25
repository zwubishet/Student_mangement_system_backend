CREATE TABLE IF NOT EXISTS finance.chapa_payment_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  invoice_id      UUID NOT NULL REFERENCES finance.invoices(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL,
  parent_user_id  UUID NOT NULL,
  tx_ref          VARCHAR(100) NOT NULL,
  amount          NUMERIC(12, 2) NOT NULL,
  currency        VARCHAR(3) NOT NULL DEFAULT 'ETB',
  status          VARCHAR(24) NOT NULL DEFAULT 'pending',
  checkout_url    TEXT,
  chapa_status    VARCHAR(40),
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  CONSTRAINT chapa_payment_sessions_tx_ref_key UNIQUE (tx_ref),
  CONSTRAINT chapa_payment_sessions_status_check
    CHECK (status IN ('pending', 'success', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_chapa_sessions_school
  ON finance.chapa_payment_sessions(school_id);

CREATE INDEX IF NOT EXISTS idx_chapa_sessions_invoice
  ON finance.chapa_payment_sessions(invoice_id);

CREATE INDEX IF NOT EXISTS idx_chapa_sessions_parent
  ON finance.chapa_payment_sessions(parent_user_id, school_id);
