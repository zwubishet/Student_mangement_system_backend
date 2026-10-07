#!/usr/bin/env bash
# Repo root, .env loading, and shared defaults.

if [[ -n "${SMS_ENV_LOADED:-}" ]]; then
  return 0 2>/dev/null || exit 0
fi
SMS_ENV_LOADED=1

SMS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

sms_load_dotenv() {
  local env_file="${1:-$SMS_ROOT/.env}"
  [[ -f "$env_file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^# ]] && continue
    [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    export "${BASH_REMATCH[1]}=${BASH_REMATCH[2]}"
  done < "$env_file"
}

sms_load_dotenv

export SMS_HASURA_DIR="${SMS_HASURA_DIR:-$SMS_ROOT/hasura}"
export SMS_COMPOSE_FILE="${SMS_COMPOSE_FILE:-$SMS_ROOT/docker/docker-compose.yml}"

SMS_COMPOSE=(docker compose --project-directory "$SMS_ROOT" -f "$SMS_COMPOSE_FILE")

_raw_hasura="${HASURA_ENDPOINT:-http://localhost:8082}"
export HASURA_ENDPOINT="${_raw_hasura%/}"
export HASURA_ENDPOINT="${HASURA_ENDPOINT%/v1/graphql}"

export HASURA_ADMIN_SECRET="${HASURA_GRAPHQL_ADMIN_SECRET:-${HASURA_ADMIN_SECRET:-supersecret}}"
export POSTGRES_USER="${POSTGRES_USER:-sms_user}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-sms_pass}"
export POSTGRES_DB="${POSTGRES_DB:-sms_db}"
export API_PORT="${PORT:-3003}"

export SMS_DB_URL_LOCAL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}"
export SMS_DB_URL_DOCKER="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}"
