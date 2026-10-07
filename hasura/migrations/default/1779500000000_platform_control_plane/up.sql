-- Platform control plane: system tenant, settings, audit, super-admin support

INSERT INTO tenancy.schools (id, name, school_address, status, plan)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'EduManage Platform',
  'System',
  'active',
  'platform'
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS tenancy.platform_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tenancy.platform_settings (key, value, description)
VALUES
  ('maintenance_mode', 'false'::jsonb, 'When true, tenant logins are blocked except SUPER_ADMIN'),
  ('default_school_plan', '"standard"'::jsonb, 'Default plan for new schools'),
  ('max_schools', '10000'::jsonb, 'Soft cap for registered schools')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS identity.platform_audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT,
  meta        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON identity.platform_audit_logs(created_at DESC);

-- Allow platform actors in audit trail (school_id optional for cross-tenant events)
ALTER TABLE identity.audit_logs ALTER COLUMN school_id DROP NOT NULL;
