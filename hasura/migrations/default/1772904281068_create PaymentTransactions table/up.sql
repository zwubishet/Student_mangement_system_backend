CREATE TABLE finance.PaymentTransactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID REFERENCES finance.payments(id),
    gateway TEXT,
    gateway_transaction_id TEXT
);
