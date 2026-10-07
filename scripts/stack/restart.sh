#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../lib/init.sh"
sms_require_docker
svc="${1:-}"
if [[ -z "$svc" ]]; then
  sms_compose restart
else
  sms_compose restart "$svc"
fi
