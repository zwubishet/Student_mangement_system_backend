CREATE TABLE operations.Exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES tenancy.schools(id),
    name TEXT,
    term_id UUID REFERENCES academic.terms(id)
);
