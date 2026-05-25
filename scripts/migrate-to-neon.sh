#!/usr/bin/env bash
# Apply Hasura migrations + metadata to a Neon (or any Postgres) database.
#
# Usage:
#   export NEON_DATABASE_URL='postgresql://user:pass@host/neondb?sslmode=require'
#   ./scripts/migrate-to-neon.sh
#
# Or:
#   ./scripts/migrate-to-neon.sh 'postgresql://...'

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HASURA_DIR="$ROOT/hasura/hasura"
CONTAINER_NAME="hasura-neon-migrate"
HASURA_PORT="${HASURA_MIGRATE_PORT:-8085}"
ADMIN_SECRET="${HASURA_ADMIN_SECRET:-supersecret}"

NEON_URL="${1:-${NEON_DATABASE_URL:-${HASURA_GRAPHQL_DATABASE_URL:-}}}"

if [[ -z "$NEON_URL" ]]; then
  echo "Error: set NEON_DATABASE_URL or pass the connection string as the first argument."
  exit 1
fi

# channel_binding breaks some clients; sslmode=require is enough for Neon
NEON_URL="${NEON_URL//&channel_binding=require/}"
NEON_URL="${NEON_URL//channel_binding=require&/}"
NEON_URL="${NEON_URL//-pooler/}"

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

echo "→ Starting temporary Hasura (port $HASURA_PORT) connected to Neon..."
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

docker run -d --name "$CONTAINER_NAME" \
  -p "${HASURA_PORT}:8080" \
  -e "HASURA_GRAPHQL_DATABASE_URL=${NEON_URL}" \
  -e "HASURA_GRAPHQL_ADMIN_SECRET=${ADMIN_SECRET}" \
  -e HASURA_GRAPHQL_ENABLE_CONSOLE=true \
  hasura/graphql-engine:v2.26.0 >/dev/null

echo "→ Waiting for Hasura to be ready..."
for i in $(seq 1 60); do
  if curl -sf "http://localhost:${HASURA_PORT}/healthz" >/dev/null 2>&1; then
    break
  fi
  if [[ "$i" -eq 60 ]]; then
    echo "Hasura did not become healthy. Logs:"
    docker logs "$CONTAINER_NAME" 2>&1 | tail -30
    exit 1
  fi
  sleep 2
done

if [[ "${RESET_NEON_MIGRATIONS:-}" == "1" ]]; then
  echo "→ RESET_NEON_MIGRATIONS=1: wiping partial schema on Neon..."
  docker run --rm -e NEON_URL="$NEON_URL" postgres:15-alpine \
    sh -c 'psql "$NEON_URL" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS hdb_catalog CASCADE;" -c "DROP SCHEMA IF EXISTS infrastructure CASCADE;" -c "DROP SCHEMA IF EXISTS finance CASCADE;" -c "DROP SCHEMA IF EXISTS operations CASCADE;" -c "DROP SCHEMA IF EXISTS student CASCADE;" -c "DROP SCHEMA IF EXISTS academic CASCADE;" -c "DROP SCHEMA IF EXISTS identity CASCADE;" -c "DROP SCHEMA IF EXISTS tenancy CASCADE;"'
  docker restart "$CONTAINER_NAME" >/dev/null
  sleep 5
  for i in $(seq 1 30); do
    curl -sf "http://localhost:${HASURA_PORT}/healthz" >/dev/null 2>&1 && break
    sleep 2
  done
fi

echo "→ Applying SQL migrations to Neon..."
cd "$HASURA_DIR"
hasura migrate apply \
  --endpoint "http://localhost:${HASURA_PORT}" \
  --admin-secret "$ADMIN_SECRET" \
  --database-name default

echo "→ Applying Hasura metadata..."
hasura metadata apply \
  --endpoint "http://localhost:${HASURA_PORT}" \
  --admin-secret "$ADMIN_SECRET"

echo "→ Verifying schemas on Neon..."
docker run --rm postgres:15-alpine \
  psql "$NEON_URL" -c "SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('tenancy','identity','student','academic') ORDER BY 1;"

echo ""
echo "Done. Neon schema is ready."
echo "For Hasura Cloud: connect the same Neon URL in the dashboard, then run:"
echo "  hasura migrate apply --endpoint https://YOUR-PROJECT.hasura.app --admin-secret ... --database-name default"
echo "  hasura metadata apply --endpoint https://YOUR-PROJECT.hasura.app --admin-secret ..."
