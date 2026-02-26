import jwt from "jsonwebtoken";

const CLAIMS_NS = process.env.HASURA_CLAIMS_NAMESPACE || 'https://hasura.io/jwt/claims';

export const generateAccessToken = (user) => {
  // keep original payload fields
  const basePayload = { ...user };

  // map role to lowercase for Hasura roles (STUDENT -> student)
  const role = (user.role || user.x_hs_role || '').toString();
  const hasuraRole = role ? role.toLowerCase() : 'anonymous';

  const hasuraClaims = {
    'x-hasura-default-role': hasuraRole,
    'x-hasura-allowed-roles': [hasuraRole],
    'x-hasura-user-id': user.userId || user.id || null,
  };

  // attach Hasura claims under configured namespace
  basePayload[CLAIMS_NS] = hasuraClaims;

  return jwt.sign(basePayload, process.env.ACCESS_TOKEN_SECRET, { expiresIn: process.env.ACCESS_TOKEN_EXPIRES });
};

export const generateRefreshToken = (user) => {
  return jwt.sign(user, process.env.REFRESH_TOKEN_SECRET, { expiresIn: process.env.REFRESH_TOKEN_EXPIRES });
};


