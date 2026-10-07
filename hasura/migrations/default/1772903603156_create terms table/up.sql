CREATE TABLE academic.Terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID REFERENCES academic.AcademicYears(id),
    name TEXT,
    start_date DATE,
    end_date DATE
);
