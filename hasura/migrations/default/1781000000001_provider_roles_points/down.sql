DROP TABLE IF EXISTS platform.point_claims;
DROP TABLE IF EXISTS platform.provider_accounts;
DROP SCHEMA IF EXISTS platform;

DELETE FROM identity.userroles ur
USING identity.roles r
WHERE ur.role_id = r.id
  AND r.name IN ('PROVIDER_ADMIN', 'SUPER_PROVIDER_ADMIN')
  AND r.school_id IS NULL;

DELETE FROM identity.roles
WHERE name IN ('PROVIDER_ADMIN', 'SUPER_PROVIDER_ADMIN') AND school_id IS NULL;
