-- High-scale student domain (student schema; tenant_id = school_id on schools)

DO $$ BEGIN
  CREATE TYPE student.gender AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE student.blood_type AS ENUM (
    'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Extend student.students (profiles) ─────────────────────────────────────
ALTER TABLE student.students ADD COLUMN IF NOT EXISTS middle_name TEXT;
ALTER TABLE student.students ADD COLUMN IF NOT EXISTS first_name_local TEXT;
ALTER TABLE student.students ADD COLUMN IF NOT EXISTS last_name_local TEXT;
ALTER TABLE student.students ADD COLUMN IF NOT EXISTS student_id_number TEXT;
ALTER TABLE student.students ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE student.students ADD COLUMN IF NOT EXISTS religion TEXT;
ALTER TABLE student.students ADD COLUMN IF NOT EXISTS home_address TEXT;
ALTER TABLE student.students ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE student.students ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE student.students ADD COLUMN IF NOT EXISTS student_email TEXT;
ALTER TABLE student.students ADD COLUMN IF NOT EXISTS enrollment_date DATE;
ALTER TABLE student.students ADD COLUMN IF NOT EXISTS withdrawal_date DATE;
ALTER TABLE student.students ADD COLUMN IF NOT EXISTS withdrawal_reason TEXT;
ALTER TABLE student.students ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE student.students ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE student.students ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES identity.users(id) ON DELETE SET NULL;

UPDATE student.students SET student_id_number = admission_number WHERE student_id_number IS NULL;
UPDATE student.students SET home_address = COALESCE(home_address, address);
UPDATE student.students SET is_active = (lifecycle_status = 'active' AND deleted_at IS NULL);
UPDATE student.students SET is_deleted = (deleted_at IS NOT NULL OR lifecycle_status = 'deleted');

-- Gender → enum
ALTER TABLE student.students ALTER COLUMN gender DROP DEFAULT;
ALTER TABLE student.students
  ALTER COLUMN gender TYPE student.gender
  USING (
    CASE lower(COALESCE(gender::text, ''))
      WHEN 'male' THEN 'male'::student.gender
      WHEN 'female' THEN 'female'::student.gender
      WHEN 'other' THEN 'other'::student.gender
      WHEN 'prefer_not_to_say' THEN 'prefer_not_to_say'::student.gender
      ELSE NULL
    END
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_student_id_number_tenant
  ON student.students(school_id, student_id_number)
  WHERE is_deleted = false AND student_id_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_tenant_active
  ON student.students(school_id) WHERE is_deleted = false AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_students_id_num
  ON student.students(school_id, student_id_number);

-- ─── Medical records (enhanced) ─────────────────────────────────────────────
ALTER TABLE student.student_medical_records
  ADD COLUMN IF NOT EXISTS conditions TEXT[],
  ADD COLUMN IF NOT EXISTS medications_json JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_updated_by UUID REFERENCES identity.users(id) ON DELETE SET NULL;

UPDATE student.student_medical_records
SET conditions = CASE
  WHEN chronic_conditions IS NOT NULL AND chronic_conditions <> ''
  THEN string_to_array(chronic_conditions, ',')
  ELSE '{}'::text[]
END
WHERE conditions IS NULL;

ALTER TABLE student.student_medical_records
  ADD COLUMN IF NOT EXISTS blood_type_enum student.blood_type;

UPDATE student.student_medical_records
SET blood_type_enum = CASE upper(COALESCE(blood_group, 'unknown'))
  WHEN 'A+' THEN 'A+'::student.blood_type
  WHEN 'A-' THEN 'A-'::student.blood_type
  WHEN 'B+' THEN 'B+'::student.blood_type
  WHEN 'B-' THEN 'B-'::student.blood_type
  WHEN 'AB+' THEN 'AB+'::student.blood_type
  WHEN 'AB-' THEN 'AB-'::student.blood_type
  WHEN 'O+' THEN 'O+'::student.blood_type
  WHEN 'O-' THEN 'O-'::student.blood_type
  ELSE 'unknown'::student.blood_type
END
WHERE blood_type_enum IS NULL;

ALTER TABLE student.student_medical_records
  ADD COLUMN IF NOT EXISTS allergies_arr TEXT[];

UPDATE student.student_medical_records
SET allergies_arr = CASE
  WHEN allergies IS NOT NULL AND allergies <> '' THEN string_to_array(allergies, ',')
  ELSE '{}'::text[]
END
WHERE allergies_arr IS NULL;

-- ─── Normalized guardians ───────────────────────────────────────────────────
-- Legacy table (student_id, name, phone) must be renamed before creating normalized guardians
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'student' AND table_name = 'guardians' AND column_name = 'student_id'
  ) THEN
    DROP TABLE IF EXISTS student.guardian_links;
    ALTER TABLE student.guardians RENAME TO guardians_direct_legacy;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS student.guardians (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  relationship    TEXT NOT NULL,
  phone_primary   TEXT,
  phone_secondary TEXT,
  email           TEXT,
  occupation      TEXT,
  user_id         UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted      BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE student.guardians ADD COLUMN IF NOT EXISTS phone_secondary TEXT;
ALTER TABLE student.guardians ADD COLUMN IF NOT EXISTS occupation TEXT;
ALTER TABLE student.guardians ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES identity.users(id) ON DELETE SET NULL;
ALTER TABLE student.guardians ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_guardians_school ON student.guardians(school_id) WHERE is_deleted = false;

-- M2M links (new); legacy denormalized rows stay in student_guardians until migrated
CREATE TABLE IF NOT EXISTS student.guardian_links (
  student_id    UUID NOT NULL REFERENCES student.students(id) ON DELETE CASCADE,
  guardian_id   UUID NOT NULL REFERENCES student.guardians(id) ON DELETE CASCADE,
  is_primary    BOOLEAN NOT NULL DEFAULT false,
  is_emergency  BOOLEAN NOT NULL DEFAULT false,
  can_pickup    BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (student_id, guardian_id)
);

-- Migrate legacy student_guardians (full_name rows) into normalized model
DO $$
DECLARE
  r RECORD;
  gid UUID;
  parts TEXT[];
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'student' AND table_name = 'student_guardians') THEN
    FOR r IN SELECT * FROM student.student_guardians LOOP
      parts := string_to_array(trim(r.full_name), ' ');
      INSERT INTO student.guardians (school_id, first_name, last_name, relationship, phone_primary, email)
      VALUES (
        r.school_id,
        parts[1],
        COALESCE(parts[2], ''),
        COALESCE(r.relationship, 'guardian'),
        r.phone,
        r.email
      )
      RETURNING id INTO gid;

      INSERT INTO student.guardian_links (student_id, guardian_id, is_primary, is_emergency, can_pickup)
      VALUES (r.student_id, gid, COALESCE(r.is_primary, false), false, true)
      ON CONFLICT DO NOTHING;
    END LOOP;
    ALTER TABLE student.student_guardians RENAME TO guardian_contacts_legacy;
  END IF;
END $$;

-- ─── Enrollments (class placement) ──────────────────────────────────────────
ALTER TABLE student.studentenrollments
  ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES academic.classes(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS roll_number SMALLINT,
  ADD COLUMN IF NOT EXISTS enrolled_by UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE student.studentenrollments se
SET class_id = c.id
FROM academic.classes c
WHERE se.class_id IS NULL
  AND c.section_id = se.section_id
  AND c.academic_year_id = se.academic_year_id
  AND c.school_id = se.school_id;

ALTER TABLE student.studentenrollments DROP CONSTRAINT IF EXISTS unique_student_year_enrollment;

CREATE UNIQUE INDEX IF NOT EXISTS uq_student_year_active_enrollment
  ON student.studentenrollments(student_id, academic_year_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_enrollment_roll_number
  ON student.studentenrollments(class_id, roll_number)
  WHERE roll_number IS NOT NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_enrollments_class ON student.studentenrollments(class_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_enrollments_year ON student.studentenrollments(academic_year_id, school_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON student.studentenrollments(student_id);

-- ─── Attendance (extend existing table for term/class/period scale) ───────
ALTER TABLE academic.attendance
  ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES academic.classes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS term_id UUID REFERENCES academic.terms(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES academic.subjects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS period_number SMALLINT,
  ADD COLUMN IF NOT EXISTS minutes_late SMALLINT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS marked_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE academic.attendance DROP CONSTRAINT IF EXISTS attendance_student_section_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_section_day
  ON academic.attendance(student_id, section_id, date)
  WHERE class_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_class_period
  ON academic.attendance(student_id, class_id, date, COALESCE(period_number, -1), COALESCE(subject_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE class_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_class_date ON academic.attendance(class_id, date) WHERE class_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON academic.attendance(student_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_absent ON academic.attendance(class_id, date)
  WHERE status IN ('absent', 'late');

-- Sync triggers
CREATE OR REPLACE FUNCTION student.sync_student_profile_flags()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  NEW.is_active := (NEW.lifecycle_status = 'active' AND NEW.deleted_at IS NULL);
  NEW.is_deleted := (NEW.deleted_at IS NOT NULL OR NEW.lifecycle_status = 'deleted');
  NEW.home_address := COALESCE(NEW.home_address, NEW.address);
  NEW.student_id_number := COALESCE(NEW.student_id_number, NEW.admission_number);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_students_sync_profile ON student.students;
CREATE TRIGGER trg_students_sync_profile
  BEFORE INSERT OR UPDATE ON student.students
  FOR EACH ROW EXECUTE FUNCTION student.sync_student_profile_flags();
