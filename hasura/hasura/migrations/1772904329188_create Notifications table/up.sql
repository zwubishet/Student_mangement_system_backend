CREATE TABLE infrastructure.Notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES tenancy.schools(id),
    title TEXT,
    message TEXT
);
