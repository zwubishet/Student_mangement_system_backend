import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

export const hashPassword = async (pw) => await bcrypt.hash(pw, 12);

export const comparePasswords = async (pw, hashed) => await bcrypt.compare(pw, hashed);

const pickDefaultRole = (roles = []) => {
  if (roles.includes('SUPER_ADMIN')) return 'SUPER_ADMIN';
  if (roles.includes('SCHOOL_ADMIN')) return 'SCHOOL_ADMIN';
  if (roles.includes('FINANCE')) return 'FINANCE';
  return roles[0];
};

export const generateHasuraToken = (user) => {
  const schoolId = user.schoolId?.toString() || process.env.PLATFORM_SCHOOL_ID || '00000000-0000-0000-0000-000000000001';
  const roles = user.roles?.length ? user.roles : ['SCHOOL_ADMIN'];

  const payload = {
    sub: user.id.toString(),
    name: `${user.firstName || ''} ${user.lastName || ''}`,
    iat: Math.floor(Date.now() / 1000),
    "https://hasura.io/jwt/claims": {
      "x-hasura-action-secret": process.env.ACTION_SECRET,
      "x-hasura-allowed-roles": roles,
      "x-hasura-default-role": pickDefaultRole(roles),
      "x-hasura-user-id": user.id.toString(),
      "x-hasura-school-id": schoolId,
      "x-hasura-first-name": user.firstName || '',
      "x-hasura-last-name": user.lastName || '',
      "x-hasura-teacher-id": user.teacherId ? user.teacherId.toString() : ""
    }
  };

 const secret = process.env.ACCESS_TOKEN_SECRET;

  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    expiresIn: '1d'
  });
};