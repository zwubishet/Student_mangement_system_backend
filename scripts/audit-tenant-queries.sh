#!/usr/bin/env bash
# Heuristic audit: flag service-layer SQL that may lack tenant scoping.
# Not a substitute for manual security review.
#
# Usage: npm run audit:tenant

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVICES="$ROOT/src/services"

echo "=== Tenant isolation heuristic audit ==="
echo "Services directory: $SERVICES"
echo ""

warn=0

# Files with query( but no school_id mention in same file
while IFS= read -r file; do
  [[ -f "$file" ]] || continue
  if grep -qE '\bquery\s*\(' "$file" && ! grep -q 'school_id' "$file" && ! grep -q 'schoolId' "$file"; then
    echo "REVIEW: $file — has query() but no school_id/schoolId in file"
    warn=$((warn + 1))
  fi
done < <(find "$SERVICES" -name '*.js' -type f)

# Portal services should reference access checks
for f in parentPortalService.js studentPortalService.js; do
  path="$SERVICES/$f"
  if [[ -f "$path" ]]; then
    if grep -q 'getParentContext\|getStudentContext' "$path"; then
      echo "OK: $f uses context resolver"
    fi
  fi
done

echo ""
if [[ "$warn" -eq 0 ]]; then
  echo "No obvious unscoped service files flagged. Manual review still required."
else
  echo "Flagged $warn file(s) for manual review."
fi
echo ""
echo "Also verify: every REST route uses requireTenant + requireRole."
echo "See docs/SECURITY.md"

exit 0
