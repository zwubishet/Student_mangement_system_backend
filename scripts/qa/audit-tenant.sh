#!/usr/bin/env bash
# Heuristic audit: service-layer SQL that may lack tenant scoping (not a full security review).
set -euo pipefail
source "$(dirname "$0")/../lib/init.sh"

SERVICES="$SMS_ROOT/api/src/services"

sms_bold "Tenant isolation heuristic audit"
sms_info "Scanning: $SERVICES"
echo ""

warn=0

while IFS= read -r file; do
  [[ -f "$file" ]] || continue
  if grep -qE '\bquery\s*\(' "$file" && ! grep -q 'school_id' "$file" && ! grep -q 'schoolId' "$file"; then
    echo "REVIEW: ${file#"$SMS_ROOT/"} — query() without school_id/schoolId in file"
    warn=$((warn + 1))
  fi
done < <(find "$SERVICES" -name '*.js' -type f)

while IFS= read -r path; do
  [[ -f "$path" ]] || continue
  if grep -qE 'getParentContext|getStudentContext|getTeacherContext' "$path"; then
    sms_info "OK portal context resolver: ${path#"$SMS_ROOT/"}"
  fi
done < <(find "$SERVICES/portal" -name '*PortalService.js' -type f 2>/dev/null || true)

echo ""
if [[ "$warn" -eq 0 ]]; then
  sms_bold "No obvious unscoped service files flagged (manual review still required)"
else
  sms_warn "Flagged $warn file(s) for manual review"
fi
sms_info "REST routes should use requireTenant + requireRole where applicable"
