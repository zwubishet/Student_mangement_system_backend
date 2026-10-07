#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../lib/init.sh"

sms_require_seed_env
sms_bold "Seeding fee billing (categories, schedules)"
sms_run_seed_script seed-fee-billing.mjs
