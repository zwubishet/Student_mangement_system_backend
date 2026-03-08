CREATE TABLE academic.Grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES tenancy.schools(id),
    name TEXT
);
