/** Platform control-plane roles (global, school_id IS NULL). */
export const PLATFORM_READ_ROLES = ['SUPER_ADMIN', 'PROVIDER_ADMIN', 'SUPER_PROVIDER_ADMIN'];

/** Full platform write access (schools, settings, approvals, etc.). */
export const PLATFORM_WRITE_ROLES = ['SUPER_ADMIN', 'PROVIDER_ADMIN'];

/** Can submit/manage own point claims; SUPER_PROVIDER_ADMIN is view-only elsewhere. */
export const POINT_CLAIM_ROLES = ['SUPER_ADMIN', 'PROVIDER_ADMIN', 'SUPER_PROVIDER_ADMIN'];

export const isPlatformReadRole = (roles = []) =>
  roles.some((r) => PLATFORM_READ_ROLES.includes(r));

export const canPlatformWrite = (roles = []) =>
  roles.some((r) => PLATFORM_WRITE_ROLES.includes(r));

export const canManagePointClaims = (roles = []) =>
  roles.some((r) => POINT_CLAIM_ROLES.includes(r));
