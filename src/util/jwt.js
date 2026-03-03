import jwt from 'jsonwebtoken';

/**
 * Generate an access token that includes Hasura JWT claims.
 * payload should include at least { userId, role }
 */
export function generateAccessToken(payload, opts = {}) {
  const role = (payload.role || '').toString();
  const hasuraClaims = {
    'x-hasura-default-role': role,
    'x-hasura-allowed-roles': ['student', 'teacher', 'director'],
    'x-hasura-user-id': payload.userId || ''
  };

  const tokenPayload = {
    ...payload,
    'https://hasura.io/jwt/claims': hasuraClaims,
  };

  const secret = process.env.ACCESS_TOKEN_SECRET || 'dev_access_secret';
  const options = Object.assign({ algorithm: 'HS256', expiresIn: '15m' }, opts);

  return jwt.sign(tokenPayload, secret, options);
}

export function generateRefreshToken(payload, opts = {}) {
  const secret = process.env.REFRESH_TOKEN_SECRET || 'dev_refresh_secret';
  const options = Object.assign({ algorithm: 'HS256', expiresIn: '30d' }, opts);
  return jwt.sign(payload, secret, options);
}

export function verifyAccessToken(token) {
  const secret = process.env.ACCESS_TOKEN_SECRET || 'dev_access_secret';
  return jwt.verify(token, secret);
}

export function verifyRefreshToken(token) {
  const secret = process.env.REFRESH_TOKEN_SECRET || 'dev_refresh_secret';
  return jwt.verify(token, secret);
}
