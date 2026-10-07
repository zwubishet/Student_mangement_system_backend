import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { ACCESS_TOKEN_TTL } from '../constants/auth.js';
import { PLATFORM_SCHOOL_ID } from '../constants/platform.js';

export const hashPassword = async (pw) => bcrypt.hash(pw, 12);

export const comparePasswords = async (pw, hashed) => bcrypt.compare(pw, hashed);

const pickDefaultRole = (roles = []) => {
  if (roles.includes('SUPER_ADMIN')) return 'SUPER_ADMIN';
  if (roles.includes('PROVIDER_ADMIN')) return 'PROVIDER_ADMIN';
  if (roles.includes('SUPER_PROVIDER_ADMIN')) return 'SUPER_PROVIDER_ADMIN';
  if (roles.includes('SCHOOL_ADMIN')) return 'SCHOOL_ADMIN';
  if (roles.includes('FINANCE')) return 'FINANCE';
  if (roles.includes('TEACHER')) return 'TEACHER';
  if (roles.includes('PARENT')) return 'PARENT';
  if (roles.includes('STUDENT')) return 'STUDENT';
  return roles[0];
};

/**
 * Issue a Hasura-compatible session JWT.
 * Never embed ACTION_SECRET or other server secrets in the payload.
 */
export const generateHasuraToken = (user) => {
  const schoolId =
    user.schoolId?.toString() ||
    process.env.PLATFORM_SCHOOL_ID ||
    PLATFORM_SCHOOL_ID;
  const roles = user.roles?.length ? user.roles : ['SCHOOL_ADMIN'];

  const claims = {
    'x-hasura-allowed-roles': roles,
    'x-hasura-default-role': pickDefaultRole(roles),
    'x-hasura-user-id': user.id.toString(),
    'x-hasura-school-id': schoolId,
    'x-hasura-first-name': user.firstName || '',
    'x-hasura-last-name': user.lastName || '',
  };

  const teacherId = user.teacherId?.toString?.() || user.teacherId;
  if (teacherId) {
    claims['x-hasura-teacher-id'] = String(teacherId);
  }

  const payload = {
    sub: user.id.toString(),
    name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    iat: Math.floor(Date.now() / 1000),
    'https://hasura.io/jwt/claims': claims,
  };

  return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
    algorithm: 'HS256',
    expiresIn: ACCESS_TOKEN_TTL,
  });
};
