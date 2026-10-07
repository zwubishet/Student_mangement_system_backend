#!/usr/bin/env bash
# Start Docker stack (Postgres, Redis, API, Hasura — dependency order via compose).
set -euo pipefail
source "$(dirname "$0")/../lib/init.sh"

infra_only="${SMS_STACK_INFRA_ONLY:-0}"
if [[ "${1:-}" == "--infra-only" ]]; then
  infra_only=1
fi

sms_require_docker
sms_bold "Starting SMS stack"

if [[ "$infra_only" == "1" ]]; then
  sms_compose -f "$SMS_ROOT/docker/compose.host-api.yml" up -d postgres redis hasura
  sms_wait_healthy postgres 90
  sms_wait_healthy redis 30
  sms_wait_healthy hasura 120
  sms_print_stack_urls
  sms_info "Infra-only: API on host → npm run dev + HASURA_ACTION_BASE_URL=http://host.docker.internal:${API_PORT}"
  sms_info "Apply metadata: npm run db:migrate"
  exit 0
fi

sms_compose up -d
sms_wait_healthy postgres 90
sms_wait_healthy redis 30
sms_wait_api_http 120
sms_wait_healthy hasura 120
sms_print_stack_urls
sms_info "Apply metadata if needed: npm run db:migrate"
sms_info "Verify actions: npm run hasura:verify"
