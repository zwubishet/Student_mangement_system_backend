#!/usr/bin/env bash
# Single entry to load all SMS script libraries.

if [[ -n "${SMS_INIT_LOADED:-}" ]]; then
  return 0 2>/dev/null || exit 0
fi
SMS_INIT_LOADED=1

_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/log.sh
source "$_LIB_DIR/log.sh"
# shellcheck source=lib/env.sh
source "$_LIB_DIR/env.sh"
# shellcheck source=lib/docker.sh
source "$_LIB_DIR/docker.sh"
# shellcheck source=lib/hasura.sh
source "$_LIB_DIR/hasura.sh"
# shellcheck source=lib/seeds.sh
source "$_LIB_DIR/seeds.sh"
