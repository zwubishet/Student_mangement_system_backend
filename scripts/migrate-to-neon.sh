#!/usr/bin/env bash
# Apply **incremental** SQL migrations + Hasura metadata to Neon.
#
# Safe for databases that already have schema/data — only NEW migration files run.
# Uses public.sms_dev_migrations (same tracker as migrate-neon-psql.sh).
#
# Usage:
#   export NEON_DATABASE_URL='postgresql://user:pass@host/neondb?sslmode=require'
#   ./scripts/migrate-to-neon.sh
#
# Fresh empty Neon (wipe everything first):
#   RESET_NEON_MIGRATIONS=1 ./scripts/migrate-to-neon.sh
#
# SQL only (no Hasura metadata):
#   bash scripts/migrate-neon-psql.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HASURA_DIR="$ROOT/hasura/hasura"
CONTAINER_NAME="hasura-neon-migrate"
HASURA_PORT="${HASURA_MIGRATE_PORT:-8085}"
ADMIN_SECRET="${HASURA_ADMIN_SECRET:-supersecret}"

NEON_URL="${1:-${NEON_DATABASE_URL:-${HASURA_GRAPHQL_DATABASE_URL:-}}}"
export NEON_DATABASE_URL="$NEON_URL"

if [[ -z "$NEON_URL" ]]; then
  echo "Error: set NEON_DATABASE_URL or pass the connection string as the first argument."
  exit 1
fi

# channel_binding breaks some clients; sslmode=require is enough for Neon
NEON_URL="${NEON_URL//&channel_binding=require/}"
NEON_URL="${NEON_URL//channel_binding=require&/}"
NEON_URL="${NEON_URL//-pooler/}"
export NEON_DATABASE_URL="$NEON_URL"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is required."
  exit 1
fi

if ! command -v hasura >/dev/null 2>&1; then
  echo "Error: install Hasura CLI: https://hasura.io/docs/latest/hasura-cli/install-hasura-cli/"
  exit 1
fi

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_hasura() {
  for i in $(seq 1 60); do
    if curl -sf "http://localhost:${HASURA_PORT}/healthz" >/dev/null 2>&1; then
      return 0
    fi
    if [[ "$i" -eq 60 ]]; then
      echo "Hasura did not become healthy. Logs:"
      docker logs "$CONTAINER_NAME" 2>&1 | tail -30
      exit 1
    fi
    sleep 2
  done
}

start_hasura() {
  echo "→ Starting temporary Hasura (port $HASURA_PORT) connected to Neon..."
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker run -d --name "$CONTAINER_NAME" \
    -p "${HASURA_PORT}:8080" \
    -e "HASURA_GRAPHQL_DATABASE_URL=${NEON_URL}" \
    -e "HASURA_GRAPHQL_ADMIN_SECRET=${ADMIN_SECRET}" \
    -e HASURA_GRAPHQL_ENABLE_CONSOLE=true \
    hasura/graphql-engine:v2.26.0 >/dev/null
  echo "→ Waiting for Hasura to be ready..."
  wait_hasura
}

if [[ "${RESET_NEON_MIGRATIONS:-}" == "1" ]]; then
  echo "→ RESET_NEON_MIGRATIONS=1: wiping schemas on Neon (full rebuild)..."
  docker run --rm postgres:15-alpine psql "$NEON_URL" -v ON_ERROR_STOP=1 \
    -c "DROP SCHEMA IF EXISTS hdb_catalog CASCADE;" \
    -c "DROP SCHEMA IF EXISTS public CASCADE;" \
    -c "CREATE SCHEMA public;" \
    -c "DROP SCHEMA IF EXISTS infrastructure CASCADE;" \
    -c "DROP SCHEMA IF EXISTS library CASCADE;" \
    -c "DROP SCHEMA IF EXISTS planning CASCADE;" \
    -c "DROP SCHEMA IF EXISTS finance CASCADE;" \
    -c "DROP SCHEMA IF EXISTS operations CASCADE;" \
    -c "DROP SCHEMA IF EXISTS student CASCADE;" \
    -c "DROP SCHEMA IF EXISTS academic CASCADE;" \
    -c "DROP SCHEMA IF EXISTS identity CASCADE;" \
    -c "DROP SCHEMA IF EXISTS tenancy CASCADE;"
fi

echo "→ Applying NEW SQL migrations only (skips versions already on Neon)..."
bash "$ROOT/scripts/migrate-neon-psql.sh"

start_hasura

echo "→ Syncing Hasura migration history (skip SQL already applied)..."
cd "$HASURA_DIR"

# Record migrations in hdb_catalog without re-running SQL (matches sms_dev_migrations).
mapfile -t _recorded < <(
  docker run --rm postgres:15-alpine psql "$NEON_URL" -tAc \
    "SELECT version FROM public.sms_dev_migrations ORDER BY version" 2>/dev/null \
    | sed '/^\s*$/d'
)

for version in "${_recorded[@]}"; do
  version="${version//[$'\r\n\t ']}"
  [[ -z "$version" ]] && continue
  hasura migrate apply \
    --endpoint "http://localhost:${HASURA_PORT}" \
    --admin-secret "$ADMIN_SECRET" \
    --database-name default \
    --skip-execution \
    --version "$version" \
    --type up >/dev/null 2>&1 || true
done

echo "→ Applying any remaining Hasura migrations (new files not yet recorded)..."
hasura migrate apply \
  --endpoint "http://localhost:${HASURA_PORT}" \
  --admin-secret "$ADMIN_SECRET" \
  --database-name default

echo "→ Applying Hasura metadata..."
hasura metadata apply \
  --endpoint "http://localhost:${HASURA_PORT}" \
  --admin-secret "$ADMIN_SECRET"

echo "→ Migration status:"
hasura migrate status \
  --endpoint "http://localhost:${HASURA_PORT}" \
  --admin-secret "$ADMIN_SECRET" \
  --database-name default || true

echo "→ Verifying schemas on Neon..."
docker run --rm postgres:15-alpine \
  psql "$NEON_URL" -c "SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('tenancy','identity','student','academic','operations','library') ORDER BY 1;"

echo ""
echo "Done. Only new migrations were applied; existing Neon schema was left intact."
echo ""
echo "Tip: SQL-only incremental runs (no Hasura): bash scripts/migrate-neon-psql.sh"
echo "Tip: Check what's applied: docker run --rm postgres:15-alpine psql \"\$NEON_DATABASE_URL\" -c \"SELECT COUNT(*), MAX(applied_at) FROM public.sms_dev_migrations;\""
