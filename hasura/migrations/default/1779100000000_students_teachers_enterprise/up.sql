-- ═══ Student enterprise extensions ═══
ALTER TABLE student.students
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS nationality TEXT,
  ADD COLUMN IF NOT EXISTS blood_group TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_students_school_status ON student.students(school_id, lifecycle_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_students_school_name ON student.students(school_id, last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_students_admission ON student.students(school_id, admission_number);
CREATE INDEX IF NOT EXISTS idx_students_created ON student.students(school_id, created_at DESC);

CREATE TABLE IF NOT EXISTS student.student_guardians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES student.students(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  relationship TEXT,
  email TEXT,
  phone TEXT,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_student_guardians_student ON student.student_guardians(student_id);

CREATE TABLE IF NOT EXISTS student.student_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES student.students(id) ON DELETE CASCADE,
  author_id UUID REFERENCES identity.users(id),
  body TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_student_notes_student ON student.student_notes(student_id, created_at DESC);

CREATE TABLE IF NOT EXISTS student.student_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES student.students(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_url TEXT,
  doc_type TEXT DEFAULT 'general',
  uploaded_by UUID REFERENCES identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_student_documents_student ON student.student_documents(student_id);

CREATE TABLE IF NOT EXISTS student.student_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#059669',
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS student.student_tag_map (
  student_id UUID NOT NULL REFERENCES student.students(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES student.student_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (student_id, tag_id)
);

CREATE TABLE IF NOT EXISTS student.student_activity_logs (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES student.students(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES identity.users(id),
  action TEXT NOT NULL,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_student_activity_student ON student.student_activity_logs(student_id, created_at DESC);

-- ═══ Teacher enterprise extensions ═══
ALTER TABLE academic.teachers
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'full_time',
  ADD COLUMN IF NOT EXISTS leave_status TEXT DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS qualification_summary TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_teachers_school_status ON academic.teachers(school_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_teachers_school_dept ON academic.teachers(school_id, department);
CREATE INDEX IF NOT EXISTS idx_teachers_name ON academic.teachers(school_id, last_name, first_name);

CREATE TABLE IF NOT EXISTS academic.teacher_qualifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES academic.teachers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  institution TEXT,
  year_obtained INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teacher_qualifications_teacher ON academic.teacher_qualifications(teacher_id);

CREATE TABLE IF NOT EXISTS academic.teacher_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES academic.teachers(id) ON DELETE CASCADE,
  author_id UUID REFERENCES identity.users(id),
  body TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teacher_notes_teacher ON academic.teacher_notes(teacher_id, created_at DESC);

CREATE TABLE IF NOT EXISTS academic.teacher_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES academic.teachers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_url TEXT,
  doc_type TEXT DEFAULT 'general',
  uploaded_by UUID REFERENCES identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academic.teacher_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES academic.teachers(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_teacher_availability_teacher ON academic.teacher_availability(teacher_id);

CREATE TABLE IF NOT EXISTS academic.teacher_activity_logs (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES academic.teachers(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES identity.users(id),
  action TEXT NOT NULL,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teacher_activity_teacher ON academic.teacher_activity_logs(teacher_id, created_at DESC);
