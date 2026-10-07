#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../lib/init.sh"

sms_require_docker
if [[ "${1:-}" == "-v" || "${1:-}" == "--volumes" ]]; then
  sms_warn "This deletes all local Postgres/Redis data!"
  sms_compose down -v
else
  sms_info "Stopping containers (data volumes kept)"
  sms_compose down
fi
