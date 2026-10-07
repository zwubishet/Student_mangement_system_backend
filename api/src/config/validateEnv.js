const DEV_WEAK_SECRETS = new Set(['supersecret', 'dev_action_secret', 'dev_access_secret', 'changeme']);

const minSecretLength = (name, value, min = 32) => {
  if (!value || value.length < min) {
    throw new Error(`${name} must be at least ${min} characters in production.`);
  }
};

/**
 * Boot-time environment validation (fail fast).
 */
export function validateEnv() {
  const required = ['DATABASE_URL', 'ACCESS_TOKEN_SECRET', 'ACTION_SECRET'];
  for (const key of required) {
    if (!process.env[key]?.trim()) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }

  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    minSecretLength('ACCESS_TOKEN_SECRET', process.env.ACCESS_TOKEN_SECRET);
    minSecretLength('ACTION_SECRET', process.env.ACTION_SECRET);

    for (const key of ['ACCESS_TOKEN_SECRET', 'ACTION_SECRET', 'HASURA_GRAPHQL_ADMIN_SECRET']) {
      const val = process.env[key];
      if (val && DEV_WEAK_SECRETS.has(val)) {
        throw new Error(`${key} must not use a default/placeholder value in production.`);
      }
    }
  }

  const webhookBase = process.env.HASURA_ACTION_BASE_URL;
  if (isProd && webhookBase && /localhost|127\.0\.0\.1/i.test(webhookBase)) {
    throw new Error(
      'HASURA_ACTION_BASE_URL must be an internal service URL in production (not localhost).'
    );
  }
}
