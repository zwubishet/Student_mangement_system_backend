DROP TABLE IF EXISTS operations.analytics_snapshots;
DROP TABLE IF EXISTS operations.report_cards;
DROP TABLE IF EXISTS operations.grade_appeals;
DROP TABLE IF EXISTS operations.mark_overrides;
DROP TABLE IF EXISTS operations.resit_exams;
DROP TABLE IF EXISTS operations.mark_alerts;
DROP TABLE IF EXISTS operations.computed_results;
DROP TABLE IF EXISTS operations.computation_runs;
DROP TABLE IF EXISTS operations.mark_review_log;

ALTER TABLE operations.examresults
  DROP COLUMN IF EXISTS mark_status,
  DROP COLUMN IF EXISTS submitted_at,
  DROP COLUMN IF EXISTS locked_at,
  DROP COLUMN IF EXISTS rejected_at,
  DROP COLUMN IF EXISTS rejection_reason,
  DROP COLUMN IF EXISTS scale_profile_id,
  DROP COLUMN IF EXISTS is_passed,
  DROP COLUMN IF EXISTS is_deleted;

ALTER TABLE operations.exam_schedules
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS submission_deadline,
  DROP COLUMN IF EXISTS marks_locked_at,
  DROP COLUMN IF EXISTS locked_by,
  DROP COLUMN IF EXISTS results_ready,
  DROP COLUMN IF EXISTS is_deleted;

ALTER TABLE operations.exams DROP COLUMN IF EXISTS exam_type_id;

ALTER TABLE operations.grading_scales
  DROP COLUMN IF EXISTS profile_id,
  DROP COLUMN IF EXISTS letter_grade,
  DROP COLUMN IF EXISTS is_pass,
  DROP COLUMN IF EXISTS display_label;

DROP TABLE IF EXISTS operations.subject_grade_configs;
DROP TABLE IF EXISTS operations.term_assessment_weights;
DROP TABLE IF EXISTS operations.grading_scale_profiles;
DROP TABLE IF EXISTS operations.exam_types;
