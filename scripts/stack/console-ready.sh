#!/usr/bin/env bash
# Full local GraphQL stack: Postgres, Redis, API, Hasura, migrations/metadata, webhook check.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../lib/init.sh"

sms_require_docker
sms_bold "Starting full stack (API + Hasura for actions)"

sms_compose up -d postgres redis app
sms_wait_healthy postgres 90
sms_wait_healthy redis 30
sms_wait_api_http 120

sms_compose up -d hasura
sms_wait_healthy hasura 120

bash "$SCRIPT_DIR/../db/migrate.sh"
bash "$SCRIPT_DIR/../hasura/verify-webhooks.sh"

sms_ok "Environment ready"
echo ""
echo "  Hasura console: ${HASURA_ENDPOINT}/console"
echo "  GraphQL:        ${HASURA_ENDPOINT}/v1/graphql"
echo "  REST API:       http://localhost:${API_PORT}/api/v1"
echo ""
sms_info "Seed demo users: npm run db:seed"
sms_info "Host API only: docker compose -f docker/docker-compose.yml -f docker/compose.host-api.yml up -d postgres redis hasura"
