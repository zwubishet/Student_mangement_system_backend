#!/usr/bin/env bash
# Apply migrations + metadata via Hasura CLI (engine must be running).

set -euo pipefail
source "$(dirname "$0")/../lib/init.sh"

sms_require_docker
sms_wait_healthy postgres 90
sms_wait_healthy hasura 120

sms_hasura_migrate_apply
sms_hasura_metadata_apply
sms_bold "Migration complete"
bash "$(dirname "$0")/status.sh"
