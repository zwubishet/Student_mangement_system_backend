/**
 * Helpers for Hasura synchronous action webhooks (POST body shape).
 */

export const isHasuraActionRequest = (req) =>
  Boolean(req.hasuraAction || req.body?.action?.name || req.headers['x-hasura-action-secret']);

/** Credential / input object from action payload (`input.object` or legacy shapes). */
export const getHasuraActionInput = (req) => {
  const { input } = req.body || {};
  if (input?.object != null) return input.object;
  if (input != null && typeof input === 'object') return input;
  return null;
};

export const getHasuraSessionVariables = (req) => req.body?.session_variables || req.hasuraSession || null;
