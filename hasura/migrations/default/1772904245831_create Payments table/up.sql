CREATE TABLE finance.Payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES finance.StudentInvoices(id),
    amount NUMERIC,
    payment_method TEXT,
    status TEXT
);
