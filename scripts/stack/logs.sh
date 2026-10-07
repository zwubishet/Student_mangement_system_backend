#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../lib/init.sh"
sms_require_docker
svc="${1:-all}"
if [[ "$svc" == "all" ]]; then
  sms_compose logs -f --tail=100
else
  sms_compose logs -f --tail=100 "$svc"
fi
