CREATE TABLE infrastructure.AuditLogs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES tenancy.schools(id),
    user_id UUID REFERENCES identity.users(id),
    action TEXT,
    entity_type TEXT,
    entity_id UUID,
    created_at TIMESTAMP DEFAULT now()
);
