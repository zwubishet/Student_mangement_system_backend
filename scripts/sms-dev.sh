#!/usr/bin/env bash
# School Management System — local Docker + migration helper
#
# Usage:
#   ./scripts/sms-dev.sh up              # start postgres, redis, hasura, app
#   ./scripts/sms-dev.sh down            # stop containers (keep data)
#   ./scripts/sms-dev.sh down-v          # stop + delete volumes (fresh DB)
#   ./scripts/sms-dev.sh migrate         # apply all Hasura SQL migrations + metadata
#   ./scripts/sms-dev.sh migrate-psql    # apply migrations via psql (no Hasura CLI)
#   ./scripts/sms-dev.sh status          # migration status
#   ./scripts/sms-dev.sh reset           # down -v, up, migrate, seed demo data
#   ./scripts/sms-dev.sh seed            # seed demo school + admin (local DB)
#   ./scripts/sms-dev.sh logs [service]  # logs (app|hasura|postgres|all)
#   ./scripts/sms-dev.sh ps              # container status
#   ./scripts/sms-dev.sh restart [svc]   # restart app or all
#
# Requires: docker, docker compose v2

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Load simple KEY=value lines only (multiline JWT in .env breaks `source`)
if [[ -f .env ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^# ]] && continue
    [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    export "${BASH_REMATCH[1]}=${BASH_REMATCH[2]}"
  done < .env
fi

COMPOSE=(docker compose)
HASURA_DIR="$ROOT/hasura/hasura"
# .env often sets HASURA_ENDPOINT to the GraphQL URL — CLI/health need the engine root
_raw_hasura="${HASURA_ENDPOINT:-http://localhost:8082}"
HASURA_ENDPOINT="${_raw_hasura%/}"
HASURA_ENDPOINT="${HASURA_ENDPOINT%/v1/graphql}"
HASURA_ADMIN_SECRET="${HASURA_GRAPHQL_ADMIN_SECRET:-${HASURA_ADMIN_SECRET:-supersecret}}"
POSTGRES_USER="${POSTGRES_USER:-sms_user}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-sms_pass}"
POSTGRES_DB="${POSTGRES_DB:-sms_db}"
API_PORT="${PORT:-3003}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '→ %s\n' "$*"; }
warn() { printf '⚠ %s\n' "$*"; }
die() { printf '✗ %s\n' "$1" >&2; exit 1; }

require_docker() {
  command -v docker >/dev/null 2>&1 || die "docker is required"
  docker compose version >/dev/null 2>&1 || die "docker compose v2 is required"
}

wait_healthy() {
  local service="$1"
  local max="${2:-60}"
  info "Waiting for $service to be healthy (max ${max}s)..."
  for i in $(seq 1 "$max"); do
    local cid
    cid=$("${COMPOSE[@]}" ps -q "$service" 2>/dev/null || true)
    if [[ -z "$cid" ]]; then
      sleep 2
      continue
    fi
    local status
    status=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}' "$cid" 2>/dev/null || echo "unknown")
    if [[ "$status" == "healthy" || "$status" == "running" ]]; then
      if [[ "$service" == "hasura" ]]; then
        if curl -sf "${HASURA_ENDPOINT}/healthz" >/dev/null 2>&1; then
          info "$service is ready"
          return 0
        fi
      elif [[ "$service" == "postgres" ]]; then
        if "${COMPOSE[@]}" exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
          info "$service is ready"
          return 0
        fi
      else
        info "$service is ready"
        return 0
      fi
    fi
    sleep 2
  done
  die "$service did not become healthy in time"
}

hasura_cli() {
  if command -v hasura >/dev/null 2>&1; then
    hasura "$@"
    return $?
  fi
  info "Hasura CLI not found locally; using npx hasura-cli@2.26.0..."
  npx --yes hasura-cli@2.26.0 "$@"
}

cmd_up() {
  require_docker
  bold "Starting SMS stack"
  "${COMPOSE[@]}" up -d
  wait_healthy postgres 90
  wait_healthy hasura 120
  wait_healthy redis 30
  "${COMPOSE[@]}" up -d app
  bold "Stack is up"
  echo "  API:        http://localhost:${API_PORT}"
  echo "  Hasura:     ${HASURA_ENDPOINT}/console"
  echo "  Postgres:   localhost:5432 (via docker network only)"
  echo ""
  echo "Next: ./scripts/sms-dev.sh migrate"
}

cmd_down() {
  require_docker
  info "Stopping containers (data volumes kept)"
  "${COMPOSE[@]}" down
}

cmd_down_v() {
  require_docker
  warn "This deletes all local Postgres/Redis data!"
  "${COMPOSE[@]}" down -v
}

cmd_ps() {
  require_docker
  "${COMPOSE[@]}" ps
}

cmd_logs() {
  require_docker
  local svc="${1:-}"
  if [[ -z "$svc" || "$svc" == "all" ]]; then
    "${COMPOSE[@]}" logs -f --tail=100
  else
    "${COMPOSE[@]}" logs -f --tail=100 "$svc"
  fi
}

cmd_restart() {
  require_docker
  local svc="${1:-}"
  if [[ -z "$svc" ]]; then
    "${COMPOSE[@]}" restart
  else
    "${COMPOSE[@]}" restart "$svc"
  fi
}

cmd_migrate() {
  require_docker
  wait_healthy postgres 90
  wait_healthy hasura 120

  if [[ ! -d "$HASURA_DIR/migrations" ]]; then
    die "Migrations directory not found: $HASURA_DIR/migrations"
  fi

  bold "Applying Hasura migrations (SQL)"
  (
    cd "$HASURA_DIR"
    hasura_cli migrate apply \
      --endpoint "$HASURA_ENDPOINT" \
      --admin-secret "$HASURA_ADMIN_SECRET" \
      --database-name default
  )

  bold "Applying Hasura metadata"
  (
    cd "$HASURA_DIR"
    hasura_cli metadata apply \
      --endpoint "$HASURA_ENDPOINT" \
      --admin-secret "$HASURA_ADMIN_SECRET"
  ) || warn "Metadata apply failed (console may still work if metadata unchanged)"

  bold "Migration complete"
  cmd_migrate_status
}

cmd_migrate_psql() {
  require_docker
  wait_healthy postgres 90

  bold "Applying migrations via psql (fallback — no Hasura CLI)"
  "${COMPOSE[@]}" exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 <<'EOSQL'
CREATE TABLE IF NOT EXISTS public.sms_dev_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
EOSQL

  local count=0
  local skipped=0
  while IFS= read -r dir; do
    [[ -z "$dir" ]] && continue
    local version
    version=$(basename "$dir")
    local up_file="$HASURA_DIR/migrations/$version/up.sql"
    [[ -f "$up_file" ]] || continue

    local exists
    exists=$("${COMPOSE[@]}" exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
      "SELECT 1 FROM public.sms_dev_migrations WHERE version = '$version' LIMIT 1" 2>/dev/null | tr -d '[:space:]')

    if [[ "$exists" == "1" ]]; then
      skipped=$((skipped + 1))
      continue
    fi

    info "Applying $version"
    if "${COMPOSE[@]}" exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f - < "$up_file"; then
      "${COMPOSE[@]}" exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
        "INSERT INTO public.sms_dev_migrations (version) VALUES ('$version') ON CONFLICT DO NOTHING" >/dev/null
      count=$((count + 1))
    else
      warn "Failed: $version (fix SQL or reset DB with: ./scripts/sms-dev.sh down-v)"
      exit 1
    fi
  done < <(find "$HASURA_DIR/migrations" -mindepth 1 -maxdepth 1 -type d | sort)

  bold "Applied $count migration(s), skipped $skipped already recorded"
  warn "Hasura metadata not applied in psql mode — run: ./scripts/sms-dev.sh migrate (with Hasura CLI) for metadata"
}

cmd_migrate_status() {
  require_docker
  if curl -sf "${HASURA_ENDPOINT}/healthz" >/dev/null 2>&1; then
    bold "Hasura migration status"
    (
      cd "$HASURA_DIR"
      hasura_cli migrate status \
        --endpoint "$HASURA_ENDPOINT" \
        --admin-secret "$HASURA_ADMIN_SECRET" \
        --database-name default
    ) 2>/dev/null || warn "Could not read Hasura status (install Hasura CLI or use migrate-psql)"
  else
    warn "Hasura not reachable at $HASURA_ENDPOINT — run: ./scripts/sms-dev.sh up"
  fi

  if "${COMPOSE[@]}" exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    echo ""
    bold "Recent sms_dev_migrations (psql fallback log)"
    "${COMPOSE[@]}" exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
      "SELECT version, applied_at FROM public.sms_dev_migrations ORDER BY applied_at DESC LIMIT 15;" 2>/dev/null \
      || echo "(none — use migrate-psql to populate)"
    echo ""
    bold "Key schemas"
    "${COMPOSE[@]}" exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('tenancy','identity','student','academic','operations','infrastructure') ORDER BY 1;"
  fi
}

cmd_seed() {
  require_docker
  wait_healthy postgres 60
  bold "Seeding demo school + admin"
  local db_url="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}"
  if ! (echo >/dev/tcp/127.0.0.1/5432) 2>/dev/null; then
    info "Postgres not on host port 5432 — seeding via docker compose exec"
    "${COMPOSE[@]}" exec -T -e DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}" \
      app node scripts/seed-neon.mjs
  else
    DATABASE_URL="$db_url" node "$ROOT/scripts/seed-neon.mjs"
  fi
  info "Default login: admin@demoschool.edu / DemoAdmin123!"
}

cmd_reset() {
  bold "Full local reset: wipe volumes → up → migrate → seed"
  cmd_down_v
  cmd_up
  if command -v hasura >/dev/null 2>&1 || command -v npx >/dev/null 2>&1; then
    cmd_migrate
  else
    warn "Hasura CLI / npx not available — using psql fallback"
    cmd_migrate_psql
  fi
  cmd_seed
  bold "Local environment is ready"
}

usage() {
  sed -n '3,18p' "$0" | sed 's/^# \{0,1\}//'
  echo ""
  echo "Examples:"
  echo "  ./scripts/sms-dev.sh up && ./scripts/sms-dev.sh migrate"
  echo "  ./scripts/sms-dev.sh reset          # fresh DB + all migrations + seed"
  echo "  npm run dev:migrate                 # same via package.json"
}

main() {
  local cmd="${1:-help}"
  shift || true
  case "$cmd" in
    up) cmd_up ;;
    down) cmd_down ;;
    down-v|down:v) cmd_down_v ;;
    migrate) cmd_migrate ;;
    migrate-psql|migrate:psql) cmd_migrate_psql ;;
    status|migrate-status) cmd_migrate_status ;;
    seed) cmd_seed ;;
    reset) cmd_reset ;;
    ps) cmd_ps ;;
    logs) cmd_logs "${1:-all}" ;;
    restart) cmd_restart "${1:-}" ;;
    help|-h|--help) usage ;;
    *)
      die "Unknown command: $cmd (run: ./scripts/sms-dev.sh help)"
      ;;
  esac
}

main "$@"
