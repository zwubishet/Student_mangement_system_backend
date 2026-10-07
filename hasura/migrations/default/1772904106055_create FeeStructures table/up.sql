CREATE TABLE finance.FeeStructures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES tenancy.schools(id),
    grade_id UUID REFERENCES academic.grades(id),
    name TEXT
);
