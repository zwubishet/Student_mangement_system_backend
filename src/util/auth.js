import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

export const hashPassword = async (pw) => await bcrypt.hash(pw, 12);

export const comparePassword = async (pw, hashed) => await bcrypt.compare(pw, hashed);

export const generateHasuraToken = (user) => {
  const payload = {
    sub: user.id.toString(),
    name: `${user.firstName} ${user.lastName}`,
    iat: Math.floor(Date.now() / 1000),
    "https://hasura.io/jwt/claims": {
      "x-hasura-allowed-roles": user.roles, // e.g., ["admin", "teacher"]
      "x-hasura-default-role": user.roles[0],
      "x-hasura-user-id": user.id,
      "x-hasura-school-id": user.schoolId
    }
  };

  return jwt.sign(payload, process.env.HASURA_GRAPHQL_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1d'
  });
};