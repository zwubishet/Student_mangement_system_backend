/** Access token lifetime (matches jwt.sign expiresIn). */
export const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '1d';

/** Fallback blacklist TTL (seconds) when JWT exp cannot be read. */
export const TOKEN_BLACKLIST_FALLBACK_SEC = 86_400;

export const AUTH_RATE_LIMIT = {
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
};
