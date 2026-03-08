CREATE TABLE tenancy.Schools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    domain TEXT UNIQUE,
    plan TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP DEFAULT now()
);
