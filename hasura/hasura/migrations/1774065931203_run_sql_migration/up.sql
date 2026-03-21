-- Let's clean up and link Classes to the rest of the system
ALTER TABLE academic.classes 
ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES academic.sections(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS academic_year_id UUID REFERENCES academic.academicyears(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 30;

-- A Class is basically: Section A + Academic Year 2026
ALTER TABLE academic.classes 
ADD CONSTRAINT unique_class_instance UNIQUE (section_id, academic_year_id);
