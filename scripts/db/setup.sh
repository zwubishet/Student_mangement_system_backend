#!/usr/bin/env bash
# One-shot: ensure stack is up, then apply Hasura migrations + metadata.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../lib/init.sh"

sms_require_docker

if ! sms_compose ps -q postgres 2>/dev/null | grep -q .; then
  bash "$SCRIPT_DIR/../stack/up.sh"
else
  sms_info "Stack already running — skipping stack up"
fi

bash "$SCRIPT_DIR/migrate.sh"
sms_bold "Database ready (Hasura migrations + metadata applied)"
sms_info "Optional: npm run db:seed   |   npm run dev"
