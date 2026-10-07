#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../lib/init.sh"
sms_require_docker
sms_compose ps
