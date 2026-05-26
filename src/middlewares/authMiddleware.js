import redisClient from '../config/redis.js';
import jwt from 'jsonwebtoken';
import AppError from '../utils/appError.js';
import catchAsync from '../utils/catchAsync.js';
import { query } from '../config/db.js';
import { PLATFORM_SCHOOL_ID } from '../constants/platform.js';
import { requireRole } from './roleGuards.js';

export { requireRole };

export const restrictBlacklisted = catchAsync(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer')) {
    const token = authHeader.split(' ')[1];

    const isBlacklisted = redisClient.isOpen
      ? await redisClient.get(`blacklist:${token}`)
      : null;
    if (isBlacklisted) {
      return next(new AppError('Token is no longer valid. Please log in again.', 401));
    }
  }
  next();
});

// FOR HASURA ACTIONS ONLY
export const protectAction = catchAsync(async (req, res, next) => {
  const actionSecret = req.headers['x-hasura-action-secret'];
  
  // Debugging tip: console.log(actionSecret, process.env.ACTION_SECRET) 
  // if you keep getting unauthorized
  
  if (!actionSecret || actionSecret !== process.env.ACTION_SECRET) {
    return next(new AppError('Unauthorized: This endpoint only accepts requests from Hasura.', 401));
  }

  if (!req.body.session_variables) {
    return next(new AppError('Unauthorized: Missing session context.', 401));
  }

  next();
});

// FOR DIRECT EXPRESS API CALLS (Login, etc)
export const protect = catchAsync(async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) return next(new AppError('Not logged in.', 401));

  const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  const claims = decoded['https://hasura.io/jwt/claims'];
  
  const allowedRoles = claims['x-hasura-allowed-roles'] || [];
  req.user = {
    id: claims['x-hasura-user-id'],
    schoolId: claims['x-hasura-school-id'],
    role: claims['x-hasura-default-role'],
    roles: Array.isArray(allowedRoles) ? allowedRoles : [claims['x-hasura-default-role']].filter(Boolean),
  };
  next();
});

/** Platform control plane — SUPER_ADMIN only; no tenant school required. */
export const requirePlatformAdmin = catchAsync(async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) return next(new AppError('Not logged in.', 401));

  const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  const claims = decoded['https://hasura.io/jwt/claims'] || {};
  const userId = claims['x-hasura-user-id'];
  const allowedRoles = claims['x-hasura-allowed-roles'] || [];
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [];

  if (!userId || !roles.includes('SUPER_ADMIN')) {
    return next(new AppError('Platform administrator access required.', 403));
  }

  req.platform = { userId, roles };
  req.user = {
    id: userId,
    schoolId: claims['x-hasura-school-id'],
    role: 'SUPER_ADMIN',
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
  let token;
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) return next(new AppError('Not logged in.', 401));

  const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  const claims = decoded['https://hasura.io/jwt/claims'] || {};
  const userId = claims['x-hasura-user-id'];
  const tokenSchoolId = claims['x-hasura-school-id'];
  const defaultRole = claims['x-hasura-default-role'];
  const allowedRoles = claims['x-hasura-allowed-roles'] || [];
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [defaultRole].filter(Boolean);

  if (!userId) {
    return next(new AppError('Invalid session: missing user.', 401));
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
      req.user = { id: userId, schoolId: managed.id, role: 'SCHOOL_ADMIN' };
      return next();
    }
  }

  if (!tokenSchoolId) {
    return next(new AppError('Invalid session: missing tenant claims.', 401));
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
  };

  next();
});

export const requirePermission = (...permissions) => catchAsync(async (req, res, next) => {
  const tenant = req.tenant;
  if (!tenant?.userId || !tenant?.schoolId) {
    return next(new AppError('Tenant context is required.', 401));
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
    return next(new AppError('Missing required permission.', 403));
  }

  next();
});
