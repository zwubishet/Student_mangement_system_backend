import jwt from 'jsonwebtoken';
import AppError from '../utils/appError.js';
import catchAsync from '../utils/catchAsync.js';
import { query } from '../config/db.js';
import { ERROR_CODES } from '../utils/errors.js';
import { PLATFORM_SCHOOL_ID } from '../constants/platform.js';
import {
  PLATFORM_READ_ROLES,
  canPlatformWrite,
  canManagePointClaims,
} from '../constants/roles.js';
import { requireRole } from './roleGuards.js';
import { isTokenBlacklisted } from '../services/auth/tokenRevocationService.js';
import { HASURA_ACTION_SECRET_HEADER } from '../constants/hasura.js';

export { requireRole };

const bearerToken = (req) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
};

const assertActionSecret = (req) => {
  const actionSecret = req.headers[HASURA_ACTION_SECRET_HEADER];
  if (!actionSecret || actionSecret !== process.env.ACTION_SECRET) {
    throw new AppError(
      'Unauthorized: invalid or missing action secret.',
      401,
      ERROR_CODES.UNAUTHORIZED
    );
  }
};

const decodeSessionJwt = (token) => {
  const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  const claims = decoded['https://hasura.io/jwt/claims'] || {};
  const allowedRoles = claims['x-hasura-allowed-roles'] || [];
  const roles = Array.isArray(allowedRoles)
    ? allowedRoles
    : [claims['x-hasura-default-role']].filter(Boolean);

  return {
    decoded,
    claims,
    userId: claims['x-hasura-user-id'],
    schoolId: claims['x-hasura-school-id'],
    defaultRole: claims['x-hasura-default-role'],
    roles,
  };
};

/** Reject revoked access tokens (Redis blacklist). Applied globally on /api/v1. */
export const restrictBlacklisted = catchAsync(async (req, res, next) => {
  const token = bearerToken(req);
  if (token && (await isTokenBlacklisted(token))) {
    return next(
      new AppError('Token is no longer valid. Please log in again.', 401, ERROR_CODES.TOKEN_INVALID)
    );
  }
  next();
});

/**
 * Hasura action — login and other public actions (secret only, no session required).
 */
export const protectHasuraAction = catchAsync(async (req, res, next) => {
  assertActionSecret(req);
  req.hasuraAction = true;
  next();
});

/**
 * When Hasura forwards the action secret (logout), validate it; REST clients omit the header.
 */
export const verifyActionSecretIfPresent = catchAsync(async (req, res, next) => {
  const actionSecret = req.headers[HASURA_ACTION_SECRET_HEADER];
  if (!actionSecret) return next();
  if (actionSecret !== process.env.ACTION_SECRET) {
    return next(
      new AppError('Unauthorized: invalid action secret.', 401, ERROR_CODES.UNAUTHORIZED)
    );
  }
  req.hasuraAction = true;
  next();
});

/** Hasura synchronous actions that require an authenticated GraphQL session. */
export const protectAction = catchAsync(async (req, res, next) => {
  assertActionSecret(req);
  const sessionVariables = req.body?.session_variables;
  const userId = sessionVariables?.['x-hasura-user-id'];

  if (!sessionVariables || !userId) {
    return next(
      new AppError('Unauthorized: missing Hasura session context.', 401, ERROR_CODES.UNAUTHORIZED)
    );
  }

  req.hasuraAction = true;
  req.hasuraSession = sessionVariables;
  next();
});

/** Bearer JWT → req.user (identity claims only). */
export const protect = catchAsync(async (req, res, next) => {
  const token = bearerToken(req);
  if (!token) return next(new AppError('Not logged in.', 401, ERROR_CODES.UNAUTHORIZED));

  const { userId, schoolId, defaultRole, roles } = decodeSessionJwt(token);
  if (!userId) {
    return next(new AppError('Invalid session: missing user.', 401, ERROR_CODES.TOKEN_INVALID));
  }

  req.user = {
    id: userId,
    schoolId,
    role: defaultRole,
    roles,
  };
  next();
});

const loadPlatformSession = (decoded) => {
  const claims = decoded['https://hasura.io/jwt/claims'] || {};
  const userId = claims['x-hasura-user-id'];
  const allowedRoles = claims['x-hasura-allowed-roles'] || [];
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [];
  return { userId, roles, claims };
};

export const requirePlatformAdmin = catchAsync(async (req, res, next) => {
  const token = bearerToken(req);
  if (!token) return next(new AppError('Not logged in.', 401, ERROR_CODES.UNAUTHORIZED));

  const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  const { userId, roles, claims } = loadPlatformSession(decoded);

  if (!userId || !roles.includes('SUPER_ADMIN')) {
    return next(new AppError('Platform administrator access required.', 403, ERROR_CODES.FORBIDDEN));
  }

  req.platform = { userId, roles, readOnly: false };
  req.user = {
    id: userId,
    schoolId: claims['x-hasura-school-id'],
    role: 'SUPER_ADMIN',
    roles,
  };
  next();
});

export const requirePlatformAccess = catchAsync(async (req, res, next) => {
  const token = bearerToken(req);
  if (!token) return next(new AppError('Not logged in.', 401, ERROR_CODES.UNAUTHORIZED));

  const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  const { userId, roles, claims } = loadPlatformSession(decoded);

  if (!userId || !roles.some((r) => PLATFORM_READ_ROLES.includes(r))) {
    return next(new AppError('Platform access required.', 403, ERROR_CODES.FORBIDDEN));
  }

  const readOnly = !canPlatformWrite(roles);
  const method = req.method.toUpperCase();
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  if (isMutation && readOnly) {
    const path = req.path || '';
    const allowedProfile = path === '/me' || path.startsWith('/me/');
    const allowedClaims = path.startsWith('/point-claims');
    if (!allowedProfile && !allowedClaims) {
      return next(
        new AppError(
          'Read-only platform access. You can update your profile and manage point claims only.',
          403,
          ERROR_CODES.FORBIDDEN
        )
      );
    }
    if (allowedClaims && !canManagePointClaims(roles)) {
      return next(new AppError('Point claim access required.', 403, ERROR_CODES.FORBIDDEN));
    }
  }

  const defaultRole = roles.includes('SUPER_ADMIN')
    ? 'SUPER_ADMIN'
    : roles.includes('PROVIDER_ADMIN')
      ? 'PROVIDER_ADMIN'
      : 'SUPER_PROVIDER_ADMIN';

  req.platform = { userId, roles, readOnly };
  req.user = {
    id: userId,
    schoolId: claims['x-hasura-school-id'],
    role: defaultRole,
    roles,
  };
  next();
});

const resolveSuperAdminTenantSchool = async (headerSchoolId) => {
  const tenantSchoolId = String(headerSchoolId || '').trim();
  if (!tenantSchoolId || tenantSchoolId === PLATFORM_SCHOOL_ID) {
    return null;
  }
  const res = await query(
    `SELECT id, name FROM tenancy.schools
     WHERE id = $1 AND COALESCE(is_deleted, false) = false`,
    [tenantSchoolId]
  );
  return res.rows[0] || null;
};

export const requireTenant = catchAsync(async (req, res, next) => {
  const token = bearerToken(req);
  if (!token) return next(new AppError('Not logged in.', 401, ERROR_CODES.UNAUTHORIZED));

  const { userId, schoolId: tokenSchoolId, defaultRole, roles } = decodeSessionJwt(token);

  if (!userId) {
    return next(new AppError('Invalid session: missing user.', 401, ERROR_CODES.TOKEN_INVALID));
  }

  if (roles.includes('SUPER_ADMIN')) {
    const tenantHeader = req.headers['x-tenant-school-id'];
    const managed = await resolveSuperAdminTenantSchool(tenantHeader);
    if (managed) {
      req.tenant = {
        userId,
        schoolId: managed.id,
        schoolName: managed.name,
        role: 'SCHOOL_ADMIN',
        roles: ['SUPER_ADMIN', 'SCHOOL_ADMIN'],
        isPlatformManage: true,
      };
      req.user = { id: userId, schoolId: managed.id, role: 'SCHOOL_ADMIN', roles: req.tenant.roles };
      return next();
    }
  }

  if (!tokenSchoolId) {
    return next(new AppError('Invalid session: missing tenant claims.', 401, ERROR_CODES.TOKEN_INVALID));
  }

  req.tenant = {
    userId,
    schoolId: tokenSchoolId,
    role: defaultRole,
    roles,
  };

  req.user = {
    id: userId,
    schoolId: tokenSchoolId,
    role: defaultRole,
    roles,
  };

  next();
});

export const requirePermission = (...permissions) =>
  catchAsync(async (req, res, next) => {
    const tenant = req.tenant;
    if (!tenant?.userId || !tenant?.schoolId) {
      return next(new AppError('Tenant context is required.', 401, ERROR_CODES.UNAUTHORIZED));
    }

    const result = await query(
      `SELECT DISTINCT p.name
     FROM identity.userroles ur
     JOIN identity.roles r ON r.id = ur.role_id
     JOIN identity.rolepermissions rp ON rp.role_id = r.id
     JOIN identity.permissions p ON p.id = rp.permission_id
     WHERE ur.user_id = $1
       AND (r.school_id = $2 OR r.school_id IS NULL)
       AND p.name = ANY($3::text[])`,
      [tenant.userId, tenant.schoolId, permissions]
    );

    const granted = new Set(result.rows.map((row) => row.name));
    const isAllowed = permissions.some((permission) => granted.has(permission));

    if (!isAllowed) {
      return next(new AppError('Missing required permission.', 403, ERROR_CODES.FORBIDDEN));
    }

    next();
  });
