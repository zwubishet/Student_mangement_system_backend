#!/usr/bin/env bash
# Smoke test: platform + tenant auth and a few protected routes (requires seeded demo users).
set -euo pipefail
source "$(dirname "$0")/../lib/init.sh"

API="${API_BASE:-http://localhost:${API_PORT}/api/v1}"
PASS=0
FAIL=0

check() {
  local name="$1"
  local code="$2"
  local expect="$3"
  if [[ "$code" == "$expect" ]]; then
    echo "  OK   $name ($code)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $name (got $code, want $expect)"
    FAIL=$((FAIL + 1))
  fi
}

sms_bold "Local API smoke test"
sms_info "Base URL: $API"
echo ""

code=$(curl -s -o /dev/null -w "%{http_code}" "$API/platform/health")
check "platform/health unauthenticated" "$code" "401"

SUPER_JSON=$(curl -s -X POST "$API/auth/session" \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@edumanage.io","password":"SuperAdmin123!"}')
SUPER_TOKEN=$(echo "$SUPER_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('token',''))" 2>/dev/null || true)
if [[ -z "$SUPER_TOKEN" ]]; then
  sms_warn "Super admin login failed — run: npm run db:seed"
  FAIL=$((FAIL + 1))
else
  echo "  OK   super admin login"
  PASS=$((PASS + 1))
fi

AUTH="Authorization: Bearer $SUPER_TOKEN"
code=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$API/platform/health")
check "platform/health authenticated" "$code" "200"

code=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$API/platform/overview")
check "platform/overview" "$code" "200"

code=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$API/platform/schools")
check "platform/schools" "$code" "200"

ADMIN_JSON=$(curl -s -X POST "$API/auth/session" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demoschool.edu","password":"DemoAdmin123!"}')
ADMIN_TOKEN=$(echo "$ADMIN_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('token',''))" 2>/dev/null || true)
if [[ -z "$ADMIN_TOKEN" ]]; then
  sms_warn "School admin login failed"
  FAIL=$((FAIL + 1))
else
  echo "  OK   school admin login"
  PASS=$((PASS + 1))
fi

A_AUTH="Authorization: Bearer $ADMIN_TOKEN"
code=$(curl -s -o /dev/null -w "%{http_code}" -H "$A_AUTH" "$API/catalog/years?detailed=true")
check "catalog/years (tenant)" "$code" "200"

code=$(curl -s -o /dev/null -w "%{http_code}" -H "$A_AUTH" "$API/dashboard/stats")
check "dashboard/stats" "$code" "200"

code=$(curl -s -o /dev/null -w "%{http_code}" -H "$A_AUTH" "$API/platform/schools")
check "platform/schools blocked for school admin" "$code" "403"

echo ""
sms_bold "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
