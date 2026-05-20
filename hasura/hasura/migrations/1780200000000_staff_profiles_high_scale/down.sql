DROP TRIGGER IF EXISTS trg_staff_sync_teacher ON identity.staff_profiles;
DROP FUNCTION IF EXISTS identity.sync_staff_teacher_denorm();

DROP TABLE IF EXISTS identity.staff_cpd;
DROP TABLE IF EXISTS identity.staff_appraisals;
DROP TABLE IF EXISTS identity.staff_leave;
DROP TABLE IF EXISTS identity.staff_contracts;

ALTER TABLE academic.teachers DROP COLUMN IF EXISTS staff_profile_id;
DROP INDEX IF EXISTS uq_teachers_staff_profile;

DROP TABLE IF EXISTS identity.staff_profiles;

DROP TYPE IF EXISTS identity.appraisal_rating;
DROP TYPE IF EXISTS identity.highest_degree;
DROP TYPE IF EXISTS identity.employment_type;
