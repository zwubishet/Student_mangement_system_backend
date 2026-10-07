-- Add sorting and grouping to Grades
ALTER TABLE academic.grades 
ADD COLUMN IF NOT EXISTS section_id uuid,      -- e.g., 'Primary'
ADD COLUMN IF NOT EXISTS level_order INT;   -- e.g., 1, 2, 3;
