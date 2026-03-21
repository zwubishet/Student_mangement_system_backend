import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

export const hashPassword = async (pw) => await bcrypt.hash(pw, 12);

export const comparePasswords = async (pw, hashed) => await bcrypt.compare(pw, hashed);

export const generateHasuraToken = (user) => {
  const payload = {
    sub: user.id.toString(),
    name: `${user.firstName || ''} ${user.lastName || ''}`,
    iat: Math.floor(Date.now() / 1000),
    "https://hasura.io/jwt/claims": {
      "x-hasura-action-secret": process.env.ACTION_SECRET,
      "x-hasura-allowed-roles": user.roles,
      "x-hasura-default-role": user.roles[0],
      "x-hasura-user-id": user.id.toString(),
      "x-hasura-school-id": user.schoolId.toString()
    }
  };

 const secret = process.env.ACCESS_TOKEN_SECRET;

  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    expiresIn: '1d'
  });
};