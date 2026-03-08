CREATE TABLE infrastructure.Files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES tenancy.schools(id),
    uploaded_by UUID REFERENCES identity.users(id),
    file_url TEXT,
    type TEXT
);
