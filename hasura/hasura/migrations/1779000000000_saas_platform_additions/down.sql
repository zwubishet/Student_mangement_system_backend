ALTER TABLE academic.sections DROP COLUMN IF EXISTS school_id;
ALTER TABLE student.students DROP COLUMN IF EXISTS updated_at;
DROP TABLE IF EXISTS academic.grade_scales;
DROP TABLE IF EXISTS tenancy.school_settings;
DROP TABLE IF EXISTS identity.audit_logs;
