#!/usr/bin/env bash
# Docker Compose helpers (requires env.sh).

sms_require_docker() {
  command -v docker >/dev/null 2>&1 || sms_die "docker is required"
  docker compose version >/dev/null 2>&1 || sms_die "docker compose v2 is required"
}

sms_compose() {
  "${SMS_COMPOSE[@]}" "$@"
}

sms_wait_healthy() {
  local service="$1"
  local max="${2:-60}"
  sms_info "Waiting for $service to be healthy (max ${max}s)..."
  local i
  for ((i = 1; i <= max; i++)); do
    local cid
    cid=$(sms_compose ps -q "$service" 2>/dev/null || true)
    if [[ -z "$cid" ]]; then
      sleep 2
      continue
    fi
    local status
    status=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}' "$cid" 2>/dev/null || echo "unknown")
    if [[ "$status" == "healthy" || "$status" == "running" ]]; then
      if [[ "$service" == "hasura" ]]; then
        if curl -sf "${HASURA_ENDPOINT}/healthz" >/dev/null 2>&1; then
          sms_info "$service is ready"
          return 0
        fi
      elif [[ "$service" == "postgres" ]]; then
        if sms_compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
          sms_info "$service is ready"
          return 0
        fi
      else
        sms_info "$service is ready"
        return 0
      fi
    fi
    sleep 2
  done
  sms_die "$service did not become healthy in time"
}

sms_postgres_host_reachable() {
  (echo >/dev/tcp/127.0.0.1/5432) 2>/dev/null
}

sms_psql_exec() {
  sms_compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
}

sms_print_stack_urls() {
  sms_bold "Stack is up"
  echo "  API:        http://localhost:${API_PORT}"
  echo "  Hasura:     ${HASURA_ENDPOINT}/console"
  echo "  Postgres:   localhost:5432 (host) / postgres:5432 (compose network)"
  echo ""
}

sms_wait_api_http() {
  local max="${1:-90}"
  local url="http://127.0.0.1:${API_PORT}/health"
  sms_info "Waiting for API at $url (max ${max}s)..."
  local i
  for ((i = 1; i <= max; i++)); do
    if curl -sf "$url" >/dev/null 2>&1; then
      sms_ok "API is ready"
      return 0
    fi
    sleep 2
  done
  sms_die "API did not respond on port ${API_PORT} — run: npm run dev  OR  npm run stack:up"
}
