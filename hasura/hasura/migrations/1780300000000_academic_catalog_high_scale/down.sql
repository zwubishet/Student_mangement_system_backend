DROP TRIGGER IF EXISTS trg_academic_year_sync ON academic.academicyears;
DROP FUNCTION IF EXISTS academic.sync_academic_year_meta();

DROP TABLE IF EXISTS academic.timetable_slots;
DROP TABLE IF EXISTS academic.class_subjects;

DROP INDEX IF EXISTS idx_classes_grade_level;
DROP INDEX IF EXISTS idx_classes_tenant_year;
DROP INDEX IF EXISTS uq_class_name_year_school;

ALTER TABLE academic.classes
  DROP COLUMN IF EXISTS is_deleted,
  DROP COLUMN IF EXISTS created_by,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS room_number,
  DROP COLUMN IF EXISTS grade_level_id;

DROP INDEX IF EXISTS uq_grade_level_order_school;

DROP INDEX IF EXISTS idx_subjects_school;
DROP INDEX IF EXISTS uq_subject_code_school;

ALTER TABLE academic.subjects
  DROP COLUMN IF EXISTS is_deleted,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS created_at,
  DROP COLUMN IF EXISTS is_core,
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS code;

DROP INDEX IF EXISTS idx_terms_school;
DROP INDEX IF EXISTS uq_year_current_term;
DROP INDEX IF EXISTS uq_term_number_year;
ALTER TABLE academic.terms DROP CONSTRAINT IF EXISTS chk_term_status;
ALTER TABLE academic.terms DROP CONSTRAINT IF EXISTS chk_term_dates;

ALTER TABLE academic.terms
  DROP COLUMN IF EXISTS is_deleted,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS created_at,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS is_current,
  DROP COLUMN IF EXISTS term_number,
  DROP COLUMN IF EXISTS school_id;

DROP INDEX IF EXISTS idx_academic_years_current;
DROP INDEX IF EXISTS idx_academic_years_school;
DROP INDEX IF EXISTS uq_school_current_academic_year;
ALTER TABLE academic.academicyears DROP CONSTRAINT IF EXISTS chk_academicyear_dates;

ALTER TABLE academic.academicyears
  DROP COLUMN IF EXISTS is_deleted,
  DROP COLUMN IF EXISTS created_by,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS created_at,
  DROP COLUMN IF EXISTS is_current;
