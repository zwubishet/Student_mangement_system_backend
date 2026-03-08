CREATE TABLE identity.Users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES tenancy.schools(id),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    first_name TEXT,
    last_name TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP DEFAULT now()
);
