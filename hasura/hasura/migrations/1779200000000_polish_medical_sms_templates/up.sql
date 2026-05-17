-- Medical records, PDF templates, SMS notification outbox

CREATE TABLE IF NOT EXISTS student.student_medical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES student.students(id) ON DELETE CASCADE,
  allergies TEXT,
  medications TEXT,
  chronic_conditions TEXT,
  blood_group TEXT,
  insurance_provider TEXT,
  insurance_number TEXT,
  physician_name TEXT,
  physician_phone TEXT,
  emergency_notes TEXT,
  last_checkup_date DATE,
  vaccination_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id)
);
CREATE INDEX IF NOT EXISTS idx_student_medical_school ON student.student_medical_records(school_id);

CREATE TABLE IF NOT EXISTS tenancy.school_pdf_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  title TEXT NOT NULL,
  header_text TEXT,
  footer_text TEXT,
  primary_color TEXT DEFAULT '#059669',
  logo_url TEXT,
  layout_json JSONB DEFAULT '{}',
  is_default BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, template_key)
);
CREATE INDEX IF NOT EXISTS idx_pdf_templates_school ON tenancy.school_pdf_templates(school_id);

CREATE TABLE IF NOT EXISTS tenancy.notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'sms',
  recipient_phone TEXT NOT NULL,
  recipient_user_id UUID,
  message_body TEXT NOT NULL,
  template_key TEXT,
  meta JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  provider_ref TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_status ON tenancy.notification_outbox(school_id, status, created_at DESC);

ALTER TABLE tenancy.school_settings
  ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_sender_id TEXT,
  ADD COLUMN IF NOT EXISTS sms_provider TEXT DEFAULT 'http',
  ADD COLUMN IF NOT EXISTS default_locale TEXT DEFAULT 'am-ET';
