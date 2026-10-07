#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../lib/init.sh"

sms_require_docker
sms_hasura_migrate_status || sms_die "Could not read Hasura migration status (run: npm run stack:up)"

if sms_compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
  echo ""
  sms_bold "Key schemas"
  sms_psql_exec -c \
    "SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('tenancy','identity','student','academic','operations','infrastructure') ORDER BY 1;"
fi
