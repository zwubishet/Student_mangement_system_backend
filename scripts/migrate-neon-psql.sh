#!/usr/bin/env bash
# Apply SQL migrations to Neon (or any remote Postgres) without Hasura CLI.
#
# Usage:
#   export NEON_DATABASE_URL='postgresql://user:pass@host/neondb?sslmode=require'
#   bash scripts/migrate-neon-psql.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HASURA_DIR="$ROOT/hasura/hasura"
NEON_URL="${NEON_DATABASE_URL:-${DATABASE_URL:-}}"

if [[ -z "$NEON_URL" ]]; then
  echo "Error: export NEON_DATABASE_URL first."
  exit 1
fi

NEON_URL="${NEON_URL//&channel_binding=require/}"
NEON_URL="${NEON_URL//channel_binding=require&/}"
# DDL/migrations must use direct host — pooler rejects or ignores many schema changes
NEON_URL="${NEON_URL//-pooler/}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is required."
  exit 1
fi

psql_neon() {
  docker run --rm postgres:15-alpine psql "$NEON_URL" -v ON_ERROR_STOP=1 "$@"
}

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '→ %s\n' "$*"; }
warn() { printf '⚠ %s\n' "$*"; }

bold "Applying migrations to Neon via psql"

psql_neon -c "CREATE SCHEMA IF NOT EXISTS public;"
psql_neon -c "
CREATE TABLE IF NOT EXISTS public.sms_dev_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"

count=0
skipped=0

while IFS= read -r dir; do
  [[ -z "$dir" ]] && continue
  version=$(basename "$dir")
  up_file="$dir/up.sql"
  [[ -f "$up_file" ]] || continue

  exists=$(docker run --rm postgres:15-alpine psql "$NEON_URL" -tAc \
    "SELECT 1 FROM public.sms_dev_migrations WHERE version = '${version//\'/\'\'}' LIMIT 1" \
    2>/dev/null | tr -d '[:space:]' || echo "")

  if [[ "$exists" == "1" ]]; then
    skipped=$((skipped + 1))
    continue
  fi

  info "Applying $version"
  set +e
  err_file=$(mktemp)
  docker run --rm -i postgres:15-alpine psql "$NEON_URL" -v ON_ERROR_STOP=1 -f - < "$up_file" 2> "$err_file"
  apply_status=$?
  apply_err=$(cat "$err_file")
  rm -f "$err_file"
  set -e

  if [[ "$apply_status" -ne 0 ]]; then
    if echo "$apply_err" | grep -qiE 'already exists|duplicate key|duplicate column'; then
      warn "Skipped $version (already applied on Neon): ${apply_err##*$'\n'}"
    else
      echo "$apply_err" >&2
      exit "$apply_status"
    fi
  fi

  psql_neon -c "INSERT INTO public.sms_dev_migrations (version) VALUES ('${version//\'/\'\'}') ON CONFLICT DO NOTHING"
  count=$((count + 1))
done < <(find "$HASURA_DIR/migrations" -mindepth 1 -maxdepth 1 -type d | sort)

bold "Applied $count migration(s), skipped $skipped already recorded"
info "Verify: docker run --rm postgres:15-alpine psql \"\$NEON_DATABASE_URL\" -c \"SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('tenancy','library','planning') ORDER BY 1;\""
