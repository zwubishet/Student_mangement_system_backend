CREATE TABLE tenancy.SchoolSettings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES tenancy.schools(id),
    key TEXT NOT NULL,
    value TEXT
);
