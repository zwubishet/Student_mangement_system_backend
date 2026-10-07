DROP TRIGGER IF EXISTS trg_students_sync_profile ON student.students;
DROP FUNCTION IF EXISTS student.sync_student_profile_flags();

DROP INDEX IF EXISTS idx_attendance_absent;
DROP INDEX IF EXISTS idx_attendance_student_date;
DROP INDEX IF EXISTS idx_attendance_class_date;
DROP INDEX IF EXISTS uq_attendance_class_period;
DROP INDEX IF EXISTS uq_attendance_section_day;

ALTER TABLE academic.attendance
  DROP COLUMN IF EXISTS marked_at,
  DROP COLUMN IF EXISTS notes,
  DROP COLUMN IF EXISTS minutes_late,
  DROP COLUMN IF EXISTS period_number,
  DROP COLUMN IF EXISTS subject_id,
  DROP COLUMN IF EXISTS term_id,
  DROP COLUMN IF EXISTS class_id;

DROP INDEX IF EXISTS idx_enrollments_student;
DROP INDEX IF EXISTS idx_enrollments_year;
DROP INDEX IF EXISTS idx_enrollments_class;
DROP INDEX IF EXISTS uq_enrollment_roll_number;
DROP INDEX IF EXISTS uq_student_year_active_enrollment;

ALTER TABLE student.studentenrollments
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS notes,
  DROP COLUMN IF EXISTS enrolled_by,
  DROP COLUMN IF EXISTS roll_number,
  DROP COLUMN IF EXISTS class_id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'student' AND table_name = 'guardian_contacts_legacy') THEN
    ALTER TABLE student.guardian_contacts_legacy RENAME TO student_guardians;
  END IF;
END $$;

DROP TABLE IF EXISTS student.guardian_links;
DROP TABLE IF EXISTS student.guardians;

ALTER TABLE student.student_medical_records
  DROP COLUMN IF EXISTS allergies_arr,
  DROP COLUMN IF EXISTS blood_type_enum,
  DROP COLUMN IF EXISTS conditions,
  DROP COLUMN IF EXISTS medications_json,
  DROP COLUMN IF EXISTS last_updated_by;

DROP INDEX IF EXISTS idx_students_id_num;
DROP INDEX IF EXISTS idx_students_tenant_active;
DROP INDEX IF EXISTS uq_student_id_number_tenant;

ALTER TABLE student.students
  ALTER COLUMN gender TYPE TEXT USING gender::text;

ALTER TABLE student.students
  DROP COLUMN IF EXISTS created_by,
  DROP COLUMN IF EXISTS is_deleted,
  DROP COLUMN IF EXISTS is_active,
  DROP COLUMN IF EXISTS withdrawal_reason,
  DROP COLUMN IF EXISTS withdrawal_date,
  DROP COLUMN IF EXISTS enrollment_date,
  DROP COLUMN IF EXISTS student_email,
  DROP COLUMN IF EXISTS region,
  DROP COLUMN IF EXISTS city,
  DROP COLUMN IF EXISTS home_address,
  DROP COLUMN IF EXISTS religion,
  DROP COLUMN IF EXISTS photo_url,
  DROP COLUMN IF EXISTS student_id_number,
  DROP COLUMN IF EXISTS last_name_local,
  DROP COLUMN IF EXISTS first_name_local,
  DROP COLUMN IF EXISTS middle_name;

DROP TYPE IF EXISTS student.blood_type;
DROP TYPE IF EXISTS student.gender;
