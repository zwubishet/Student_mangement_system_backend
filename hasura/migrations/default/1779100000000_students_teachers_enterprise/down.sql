DROP TABLE IF EXISTS academic.teacher_activity_logs;
DROP TABLE IF EXISTS academic.teacher_availability;
DROP TABLE IF EXISTS academic.teacher_documents;
DROP TABLE IF EXISTS academic.teacher_notes;
DROP TABLE IF EXISTS academic.teacher_qualifications;
DROP TABLE IF EXISTS student.student_activity_logs;
DROP TABLE IF EXISTS student.student_tag_map;
DROP TABLE IF EXISTS student.student_tags;
DROP TABLE IF EXISTS student.student_documents;
DROP TABLE IF EXISTS student.student_notes;
DROP TABLE IF EXISTS student.student_guardians;

ALTER TABLE academic.teachers
  DROP COLUMN IF EXISTS department,
  DROP COLUMN IF EXISTS employment_type,
  DROP COLUMN IF EXISTS leave_status,
  DROP COLUMN IF EXISTS qualification_summary,
  DROP COLUMN IF EXISTS address,
  DROP COLUMN IF EXISTS deleted_at,
  DROP COLUMN IF EXISTS archived_at,
  DROP COLUMN IF EXISTS updated_at;

ALTER TABLE student.students
  DROP COLUMN IF EXISTS phone,
  DROP COLUMN IF EXISTS address,
  DROP COLUMN IF EXISTS nationality,
  DROP COLUMN IF EXISTS blood_group,
  DROP COLUMN IF EXISTS emergency_contact_name,
  DROP COLUMN IF EXISTS emergency_contact_phone,
  DROP COLUMN IF EXISTS lifecycle_status,
  DROP COLUMN IF EXISTS deleted_at,
  DROP COLUMN IF EXISTS archived_at;
