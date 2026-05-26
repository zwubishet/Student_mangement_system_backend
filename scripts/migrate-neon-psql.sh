#!/usr/bin/env bash
# Apply SQL migrations to Neon (or any remote Postgres) without Hasura CLI.
#
# INCREMENTAL: skips migrations already recorded in public.sms_dev_migrations.
# If objects already exist (e.g. schools table), records the version and continues.
#
# Usage:
#   export NEON_DATABASE_URL='postgresql://user:pass@host/neondb?sslmode=require'
#   bash scripts/migrate-neon-psql.sh
#
# Verbose (print every skip):
#   MIGRATE_VERBOSE=1 bash scripts/migrate-neon-psql.sh
#
# Full flow (SQL + Hasura metadata):
#   ./scripts/migrate-to-neon.sh

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
NEON_URL="${NEON_URL//?channel_binding=require/}"
# DDL must use direct host — pooler can hang or reject schema changes
if [[ "$NEON_URL" == *"-pooler"* ]]; then
  echo "→ Using direct Neon host (removed -pooler from URL for migrations)"
  NEON_URL="${NEON_URL//-pooler/}"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is required."
  exit 1
fi

export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-20}"

psql_neon() {
  docker run --rm -e PGCONNECT_TIMEOUT="$PGCONNECT_TIMEOUT" postgres:15-alpine \
    psql "$NEON_URL" -v ON_ERROR_STOP=1 "$@"
}

psql_neon_stdin() {
  docker run --rm -i -e PGCONNECT_TIMEOUT="$PGCONNECT_TIMEOUT" postgres:15-alpine \
    psql "$NEON_URL" -v ON_ERROR_STOP=1 -f -
}

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '→ %s\n' "$*"; }
warn() { printf '⚠ %s\n' "$*"; }
progress() { printf '  [%s/%s] %s\n' "$1" "$2" "$3"; }

is_applied() {
  local v="$1"
  grep -Fxq "$v" "$APPLIED_FILE" 2>/dev/null
}

bold "Applying migrations to Neon via psql"
info "Connection timeout: ${PGCONNECT_TIMEOUT}s per query"

info "Testing Neon connection..."
if ! psql_neon -c "SELECT 1 AS ok;" >/dev/null 2>&1; then
  echo "Error: cannot connect to Neon. Check NEON_DATABASE_URL, network, and use direct host (not pooler)." >&2
  exit 1
fi
info "Connected."

psql_neon -c "CREATE SCHEMA IF NOT EXISTS public;" >/dev/null
psql_neon -c "
CREATE TABLE IF NOT EXISTS public.sms_dev_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
" >/dev/null

APPLIED_FILE=$(mktemp)
trap 'rm -f "$APPLIED_FILE"' EXIT

info "Loading applied migration log from Neon..."
psql_neon -tAc "SELECT version FROM public.sms_dev_migrations ORDER BY version" \
  | sed '/^\s*$/d' > "$APPLIED_FILE" || true
already=$(wc -l < "$APPLIED_FILE" | tr -d ' ')

mapfile -t MIGRATION_DIRS < <(find "$HASURA_DIR/migrations" -mindepth 1 -maxdepth 1 -type d | sort)
total=${#MIGRATION_DIRS[@]}
info "Found $total migration folders ($already already recorded on Neon)"

count=0
skipped=0
idx=0

for dir in "${MIGRATION_DIRS[@]}"; do
  idx=$((idx + 1))
  version=$(basename "$dir")
  up_file="$dir/up.sql"
  [[ -f "$up_file" ]] || continue

  if is_applied "$version"; then
    skipped=$((skipped + 1))
    if [[ "${MIGRATE_VERBOSE:-}" == "1" ]]; then
      progress "$idx" "$total" "skip (recorded) $version"
    elif (( idx % 20 == 0 )); then
      progress "$idx" "$total" "skipping recorded migrations…"
    fi
    continue
  fi

  progress "$idx" "$total" "apply $version"
  set +e
  err_file=$(mktemp)
  psql_neon_stdin < "$up_file" 2> "$err_file"
  apply_status=$?
  apply_err=$(cat "$err_file")
  rm -f "$err_file"
  set -e

  if [[ "$apply_status" -ne 0 ]]; then
    if echo "$apply_err" | grep -qiE 'already exists|duplicate key|duplicate column'; then
      warn "objects exist — marking $version as applied"
    else
      echo "$apply_err" >&2
      exit "$apply_status"
    fi
  fi

  psql_neon -c "INSERT INTO public.sms_dev_migrations (version) VALUES ('${version//\'/\'\'}') ON CONFLICT DO NOTHING" >/dev/null
  echo "$version" >> "$APPLIED_FILE"
  count=$((count + 1))
done

bold "Done: applied $count new migration(s), skipped $skipped already recorded"
info "Total recorded on Neon: $(wc -l < "$APPLIED_FILE" | tr -d ' ')"
info "Verify: docker run --rm -e PGCONNECT_TIMEOUT=15 postgres:15-alpine psql \"\$NEON_DATABASE_URL\" -c \"SELECT COUNT(*) FROM public.sms_dev_migrations;\""
