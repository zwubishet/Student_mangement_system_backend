CREATE TABLE tenancy.Subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES tenancy.schools(id),
    customer_id TEXT,
    subscription_id TEXT,
    plan TEXT,
    status TEXT,
    period_start TIMESTAMP,
    period_end TIMESTAMP
);
