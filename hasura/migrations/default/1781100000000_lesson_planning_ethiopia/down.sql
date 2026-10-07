DROP TABLE IF EXISTS planning.continuous_assessments;
DROP TABLE IF EXISTS planning.daily_lesson_plans;
DROP TABLE IF EXISTS planning.weekly_plans;
DROP TABLE IF EXISTS planning.unit_plans;
DROP TABLE IF EXISTS planning.annual_plan_months;
DROP TABLE IF EXISTS planning.annual_plans;
DROP TABLE IF EXISTS planning.national_exam_calendar;
DROP TABLE IF EXISTS planning.school_period_config;

ALTER TABLE academic.timetable_slots
  DROP COLUMN IF EXISTS academic_year_id,
  DROP COLUMN IF EXISTS section_id,
  DROP COLUMN IF EXISTS room_number;

ALTER TABLE academic.terms DROP COLUMN IF EXISTS semester_label;

DROP SCHEMA IF EXISTS planning CASCADE;
