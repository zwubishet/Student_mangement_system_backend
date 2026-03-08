CREATE TABLE academic.Classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL,

    name TEXT NOT NULL,
    grade_level INT,
    description TEXT,

    created_at TIMESTAMP DEFAULT now(),

    FOREIGN KEY (school_id) REFERENCES tenancy.schools(id)
);
