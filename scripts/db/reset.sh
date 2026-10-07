#!/usr/bin/env bash
# Wipe volumes → stack up → Hasura migrate → seed

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../lib/init.sh"

sms_bold "Full local reset: wipe volumes → up → Hasura migrate → seed"
bash "$SCRIPT_DIR/../stack/down.sh" -v
bash "$SCRIPT_DIR/../stack/up.sh"
bash "$SCRIPT_DIR/migrate.sh"
bash "$SCRIPT_DIR/seed.sh"
sms_bold "Local environment is ready"
