#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../lib/init.sh"

sms_require_seed_env
sms_bold "Seeding demo environment"

sms_run_seed_script seed-school.mjs
sms_run_seed_script seed-super-admin.mjs
sms_run_seed_script seed-demo-academy.mjs
sms_run_seed_script seed-fee-billing.mjs || sms_warn "Fee billing seed skipped (optional)"

echo ""
sms_print_seed_credentials
