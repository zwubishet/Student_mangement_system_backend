#!/usr/bin/env bash
# Logging helpers for SMS shell tooling (stderr for errors only).

sms_bold() { printf '\033[1m%s\033[0m\n' "$*"; }
sms_info() { printf '→ %s\n' "$*"; }
sms_ok() { printf '✓ %s\n' "$*"; }
sms_warn() { printf '⚠ %s\n' "$*" >&2; }
sms_die() { printf '✗ %s\n' "$1" >&2; exit 1; }
