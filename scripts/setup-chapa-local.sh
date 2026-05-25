#!/usr/bin/env bash
# Apply Chapa DB migration and print local test checklist.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^# ]] && continue
    [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    export "${BASH_REMATCH[1]}=${BASH_REMATCH[2]}"
  done < .env
fi

DB_URL="${DATABASE_URL:-postgres://sms_user:sms_pass@localhost:5432/sms_db}"
MIG="$ROOT/hasura/hasura/migrations/1781300000000_chapa_parent_payments/up.sql"

if ! psql "$DB_URL" -tAc "SELECT 1 FROM information_schema.schemata WHERE schema_name = 'finance'" | grep -q 1; then
  echo "✗ Schema 'finance' not found. Run full migrations first:"
  echo "    cd $ROOT && ./scripts/sms-dev.sh migrate-psql"
  echo "    # or: ./scripts/sms-dev.sh up && ./scripts/sms-dev.sh migrate"
  exit 1
fi

echo "→ Applying finance.chapa_payment_sessions migration..."
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$MIG"

echo ""
echo "=== Chapa local setup checklist ==="
echo ""
if [[ -z "${CHAPA_SECRET_KEY:-}" ]]; then
  echo "  [ ] Add CHAPA_SECRET_KEY to $ROOT/.env (test key from Chapa dashboard)"
else
  echo "  [x] CHAPA_SECRET_KEY is set"
fi
echo "  [ ] Backend running on: ${API_PUBLIC_URL:-http://localhost:${PORT:-3004}}"
echo "  [ ] Frontend VITE_API_URL must point at the same host/port + /api/v1 path"
echo "  [ ] FRONTEND_URL=${FRONTEND_URL:-http://localhost:5173}"
echo ""
echo "Get keys: https://dashboard.chapa.co → Log in → Settings → API Keys"
echo "  • Use TEST / sandbox secret (starts with CHASECK-...)"
echo "  • Optional: Webhooks → set secret → copy to CHAPA_WEBHOOK_SECRET"
echo "  • For webhooks to localhost, expose API with ngrok and set API_PUBLIC_URL"
echo ""
echo "Test flow:"
echo "  1. Log in as parent (demo seed may include guardians)"
echo "  2. Parent → child → Pay with Chapa on an invoice with balance"
echo "  3. Complete payment on Chapa test checkout"
echo "  4. Return URL verifies payment; finance/admin invoices refresh (~20s poll)"
echo ""
