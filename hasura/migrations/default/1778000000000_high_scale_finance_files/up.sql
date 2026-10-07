ALTER TABLE finance.invoices
  ADD COLUMN IF NOT EXISTS fee_structure_id UUID REFERENCES finance.feestructures(id),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS finance.invoiceitems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES finance.invoices(id) ON DELETE CASCADE,
  fee_structure_item_id UUID REFERENCES finance.feestructureitems(id),
  name TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE finance.payments
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS received_by UUID REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'finance.payments'::regclass
    AND contype = 'f'
    AND conkey = ARRAY[
      (SELECT attnum FROM pg_attribute WHERE attrelid = 'finance.payments'::regclass AND attname = 'invoice_id')
    ];

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE finance.payments DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

ALTER TABLE finance.payments
  ADD CONSTRAINT payments_invoice_id_fkey
  FOREIGN KEY (invoice_id) REFERENCES finance.invoices(id) ON DELETE CASCADE;

ALTER TABLE finance.paymenttransactions
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'succeeded',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE infrastructure.files
  ADD COLUMN IF NOT EXISTS object_key TEXT,
  ADD COLUMN IF NOT EXISTS bucket TEXT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_invoiceitems_invoice ON finance.invoiceitems(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_school_status_due ON finance.invoices(school_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_payments_school_invoice ON finance.payments(school_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_files_school_status ON infrastructure.files(school_id, status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_school_student_fee_due_key'
  ) THEN
    ALTER TABLE finance.invoices
      ADD CONSTRAINT invoices_school_student_fee_due_key
      UNIQUE (school_id, student_id, fee_structure_id, due_date);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_school_idempotency_key'
  ) THEN
    ALTER TABLE finance.payments
      ADD CONSTRAINT payments_school_idempotency_key
      UNIQUE (school_id, idempotency_key);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'paymenttransactions_gateway_transaction_id_key'
  ) THEN
    ALTER TABLE finance.paymenttransactions
      ADD CONSTRAINT paymenttransactions_gateway_transaction_id_key
      UNIQUE (gateway_transaction_id);
  END IF;
END $$;
