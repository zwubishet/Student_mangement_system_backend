ALTER TABLE tenancy.school_settings
  DROP COLUMN IF EXISTS sms_enabled,
  DROP COLUMN IF EXISTS sms_sender_id,
  DROP COLUMN IF EXISTS sms_provider,
  DROP COLUMN IF EXISTS default_locale;

DROP TABLE IF EXISTS tenancy.notification_outbox;
DROP TABLE IF EXISTS tenancy.school_pdf_templates;
DROP TABLE IF EXISTS student.student_medical_records;
