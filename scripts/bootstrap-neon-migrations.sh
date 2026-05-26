#!/usr/bin/env bash
# One-time: mark ALL local migration versions as applied on Neon WITHOUT running SQL.
# Use when Neon already has the full schema (from an earlier deploy) but
# public.sms_dev_migrations is empty — avoids re-running 100+ migrations.
#
# Usage:
#   export NEON_DATABASE_URL='postgresql://...'
#   bash scripts/bootstrap-neon-migrations.sh
#
# Then apply only NEW migrations:
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
NEON_URL="${NEON_URL//?channel_binding=require/}"
NEON_URL="${NEON_URL//-pooler/}"

export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-20}"

psql_neon() {
  docker run --rm -e PGCONNECT_TIMEOUT="$PGCONNECT_TIMEOUT" postgres:15-alpine \
    psql "$NEON_URL" -v ON_ERROR_STOP=1 "$@"
}

echo "→ Bootstrapping migration log on Neon (no SQL execution)"

psql_neon -c "
CREATE TABLE IF NOT EXISTS public.sms_dev_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
" >/dev/null

# Safety: only bootstrap if core schema looks populated
has_schema=$(psql_neon -tAc \
  "SELECT 1 FROM information_schema.tables WHERE table_schema = 'tenancy' AND table_name = 'schools' LIMIT 1" \
  | tr -d '[:space:]')

if [[ "$has_schema" != "1" ]]; then
  echo "Error: tenancy.schools not found — Neon looks empty. Use migrate-neon-psql.sh instead." >&2
  exit 1
fi

count=0
while IFS= read -r dir; do
  [[ -z "$dir" ]] && continue
  version=$(basename "$dir")
  [[ -f "$dir/up.sql" ]] || continue
  psql_neon -c "INSERT INTO public.sms_dev_migrations (version) VALUES ('${version//\'/\'\'}') ON CONFLICT DO NOTHING" >/dev/null
  count=$((count + 1))
done < <(find "$HASURA_DIR/migrations" -mindepth 1 -maxdepth 1 -type d | sort)

recorded=$(psql_neon -tAc "SELECT COUNT(*) FROM public.sms_dev_migrations" | tr -d '[:space:]')
echo "→ Recorded $count migration version(s). Total on Neon: $recorded"
echo "→ Now run: bash scripts/migrate-neon-psql.sh   (applies only NEW migrations)"
