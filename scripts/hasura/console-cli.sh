#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../lib/init.sh"

if ! curl -sf "${HASURA_ENDPOINT}/healthz" >/dev/null 2>&1; then
  sms_die "Hasura is not running. Run: npm run hasura:up"
fi

cd "$SMS_HASURA_DIR"
sms_hasura_cli console \
  --endpoint "$HASURA_ENDPOINT" \
  --admin-secret "$HASURA_ADMIN_SECRET"
