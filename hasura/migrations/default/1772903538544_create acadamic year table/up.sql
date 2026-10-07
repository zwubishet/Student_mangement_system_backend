CREATE TABLE academic.AcademicYears (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES tenancy.schools(id),
    name TEXT,
    start_date DATE,
    end_date DATE
);
