DROP TABLE IF EXISTS operations.exam_schedules;

ALTER TABLE operations.grading_scales DROP COLUMN IF EXISTS grade_points;
ALTER TABLE operations.grading_scales DROP COLUMN IF EXISTS sort_order;

ALTER TABLE operations.examresults
  DROP COLUMN IF EXISTS schedule_id,
  DROP COLUMN IF EXISTS class_id,
  DROP COLUMN IF EXISTS subject_id,
  DROP COLUMN IF EXISTS exam_id,
  DROP COLUMN IF EXISTS verified_at,
  DROP COLUMN IF EXISTS verified_by,
  DROP COLUMN IF EXISTS entered_at,
  DROP COLUMN IF EXISTS entered_by,
  DROP COLUMN IF EXISTS teacher_notes,
  DROP COLUMN IF EXISTS grade_points,
  DROP COLUMN IF EXISTS is_absent,
  DROP COLUMN IF EXISTS updated_at;

ALTER TABLE operations.exams
  DROP CONSTRAINT IF EXISTS exams_exam_type_check;

ALTER TABLE operations.exams
  DROP COLUMN IF EXISTS exam_type,
  DROP COLUMN IF EXISTS max_score,
  DROP COLUMN IF EXISTS pass_score,
  DROP COLUMN IF EXISTS exam_date,
  DROP COLUMN IF EXISTS instructions,
  DROP COLUMN IF EXISTS is_deleted,
  DROP COLUMN IF EXISTS created_by,
  DROP COLUMN IF EXISTS updated_at;
