#!/usr/bin/env bash
# Run a single seed module by short name (see: ./scripts/sms seed --list)
set -euo pipefail
source "$(dirname "$0")/../lib/init.sh"

name="${1:-}"
[[ -n "$name" ]] || sms_die "Usage: seed-one.sh <name>  (try: ./scripts/sms seed --list)"

case "$name" in
  school) file=seed-school.mjs ;;
  super | super-admin) file=seed-super-admin.mjs ;;
  provider) file=seed-provider-admins.mjs ;;
  demo) file=seed-demo-academy.mjs ;;
  grading) file=seed-grading-demo.mjs ;;
  finance | finance-officer) file=seed-finance-officer.mjs ;;
  fees | fee-billing) file=seed-fee-billing.mjs ;;
  *)
    sms_die "Unknown seed '$name'. Run: ./scripts/sms seed --list"
    ;;
esac

sms_require_seed_env
sms_bold "Running seed: $file"
sms_run_seed_script "$file"
