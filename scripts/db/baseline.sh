#!/usr/bin/env bash
# Mark all migrations as applied in Hasura without running SQL (DB already has schema).

set -euo pipefail
source "$(dirname "$0")/../lib/init.sh"

sms_require_docker
sms_wait_healthy postgres 90
sms_wait_healthy hasura 120

sms_bold "Baselining Hasura migration catalog (skip SQL execution)"
(
  cd "$SMS_HASURA_DIR"
  sms_hasura_cli migrate apply \
    --skip-execution \
    --up all \
    --endpoint "$HASURA_ENDPOINT" \
    --admin-secret "$HASURA_ADMIN_SECRET" \
    --database-name default
)
sms_hasura_metadata_apply
sms_bold "Baseline complete — future npm run db:migrate applies only new versions"
