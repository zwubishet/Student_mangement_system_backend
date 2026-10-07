/** Header Hasura sends on synchronous action webhooks (see metadata actions.yaml). */
export const HASURA_ACTION_SECRET_HEADER = 'x-hasura-action-secret';

/** Request body fields set by Hasura GraphQL Engine. */
export const HASURA_ACTION_BODY = {
  action: 'action',
  input: 'input',
  sessionVariables: 'session_variables',
};
