ALTER TABLE academic.sections 
ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES tenancy.schools(id) ON DELETE CASCADE,
ALTER COLUMN grade_id SET NOT NULL,
ALTER COLUMN name SET NOT NULL;

-- Ensure Grade 1 can't have two "Section A" entries
ALTER TABLE academic.sections 
ADD CONSTRAINT unique_section_per_grade UNIQUE (grade_id, name);
