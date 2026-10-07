DROP TABLE IF EXISTS finance.invoiceitems;

ALTER TABLE finance.invoices
  DROP COLUMN IF EXISTS fee_structure_id,
  DROP COLUMN IF EXISTS idempotency_key,
  DROP COLUMN IF EXISTS updated_at;

ALTER TABLE finance.payments
  DROP CONSTRAINT IF EXISTS payments_school_idempotency_key,
  DROP CONSTRAINT IF EXISTS payments_invoice_id_fkey,
  DROP COLUMN IF EXISTS school_id,
  DROP COLUMN IF EXISTS idempotency_key,
  DROP COLUMN IF EXISTS received_by,
  DROP COLUMN IF EXISTS created_at;

ALTER TABLE finance.paymenttransactions
  DROP CONSTRAINT IF EXISTS paymenttransactions_gateway_transaction_id_key,
  DROP COLUMN IF EXISTS school_id,
  DROP COLUMN IF EXISTS amount,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS created_at;

ALTER TABLE infrastructure.files
  DROP COLUMN IF EXISTS object_key,
  DROP COLUMN IF EXISTS bucket,
  DROP COLUMN IF EXISTS mime_type,
  DROP COLUMN IF EXISTS size_bytes,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS created_at;
