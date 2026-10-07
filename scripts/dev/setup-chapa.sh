#!/usr/bin/env bash
# Apply Chapa finance migration slice and print local integration checklist.
set -euo pipefail
source "$(dirname "$0")/../lib/init.sh"

command -v psql >/dev/null 2>&1 || sms_die "psql is required"

DB_URL="${DATABASE_URL:-$SMS_DB_URL_LOCAL}"
MIG="$SMS_ROOT/hasura/migrations/default/1781300000000_chapa_parent_payments/up.sql"

if ! psql "$DB_URL" -tAc "SELECT 1 FROM information_schema.schemata WHERE schema_name = 'finance'" | grep -q 1; then
  sms_die "Schema 'finance' not found — run: npm run db:migrate"
fi

sms_bold "Applying Chapa payment sessions migration"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$MIG"

echo ""
sms_bold "Chapa local checklist"
if [[ -z "${CHAPA_SECRET_KEY:-}" ]]; then
  sms_warn "Set CHAPA_SECRET_KEY in .env (Chapa dashboard → test key)"
else
  sms_info "CHAPA_SECRET_KEY is set"
fi
sms_info "API public URL: ${API_PUBLIC_URL:-http://localhost:${API_PORT}}"
sms_info "Frontend: ${FRONTEND_URL:-http://localhost:5173}"
echo ""
sms_info "Test: parent portal → Pay with Chapa on an invoice with balance"
