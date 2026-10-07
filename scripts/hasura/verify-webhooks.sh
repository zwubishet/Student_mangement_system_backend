#!/usr/bin/env bash
# Verify Hasura can reach the action webhook base URL (run after stack is up).
set -euo pipefail
source "$(dirname "$0")/../lib/init.sh"

sms_require_docker

base="${HASURA_ACTION_BASE_URL:-http://app:3003}"
base="${base%/}"

sms_bold "Hasura action webhook connectivity"
sms_info "Expected base URL: $base"

if curl -sf "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
  sms_ok "API reachable from host on port ${API_PORT}"
else
  sms_warn "API not reachable on host port ${API_PORT}"
fi

if sms_compose ps -q hasura 2>/dev/null | grep -q .; then
  sms_info "Checking from Hasura container..."
  if sms_compose exec -T hasura curl -sf "${base}/health" >/dev/null 2>&1; then
    sms_ok "Hasura → API health OK (${base}/health)"
  else
    sms_die "Hasura cannot reach ${base}/health — fix HASURA_ACTION_BASE_URL and ensure API is running"
  fi

  secret_ok=$(sms_compose exec -T hasura printenv ACTION_SECRET 2>/dev/null | wc -c)
  if [[ "${secret_ok// /}" -gt 1 ]]; then
    sms_ok "ACTION_SECRET is set inside Hasura (value_from_env for actions)"
  else
    sms_warn "ACTION_SECRET missing in Hasura container — action auth will fail"
  fi
else
  sms_warn "Hasura container not running — skip in-container check"
fi

sms_info "Re-apply metadata after URL/secret changes: npm run db:migrate"
