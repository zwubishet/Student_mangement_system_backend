-- 1. Refine Students Table
ALTER TABLE student.students 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES identity.users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
ALTER COLUMN school_id SET NOT NULL,
ALTER COLUMN admission_number SET NOT NULL;

-- Ensure admission numbers are unique within a single school
ALTER TABLE student.students 
ADD CONSTRAINT unique_admission_per_school UNIQUE (school_id, admission_number);

-- 2. Refine Enrollment Table
ALTER TABLE student.studentenrollments 
ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES tenancy.schools(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS enrolled_at TIMESTAMPTZ DEFAULT now(),
ALTER COLUMN student_id SET NOT NULL,
ALTER COLUMN academic_year_id SET NOT NULL;

-- Ensure a student cannot be enrolled in two different sections for the same year
ALTER TABLE student.studentenrollments 
ADD CONSTRAINT unique_student_year_enrollment UNIQUE (student_id, academic_year_id);
