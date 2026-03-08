CREATE TABLE academic.Sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grade_id UUID REFERENCES academic.grades(id),
    name TEXT
);
