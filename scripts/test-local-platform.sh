#!/usr/bin/env bash
# Quick smoke test for local platform + tenant APIs
set -euo pipefail
API="${API_BASE:-http://localhost:3003/api/v1}"
PASS=0
FAIL=0

check() {
  local name="$1"
  local code="$2"
  local expect="$3"
  if [[ "$code" == "$expect" ]]; then
    echo "  OK  $name ($code)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $name (got $code, want $expect)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Local API smoke test ==="
echo "API: $API"
echo ""

# Health without auth should be 401 on platform health (protected)
code=$(curl -s -o /dev/null -w "%{http_code}" "$API/platform/health")
check "platform/health unauthenticated" "$code" "401"

# Super admin login
SUPER_JSON=$(curl -s -X POST "$API/auth/session" \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@edumanage.io","password":"SuperAdmin123!"}')
SUPER_TOKEN=$(echo "$SUPER_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('token',''))" 2>/dev/null || true)
if [[ -z "$SUPER_TOKEN" ]]; then
  echo "  FAIL super admin login: $SUPER_JSON"
  FAIL=$((FAIL + 1))
else
  echo "  OK  super admin login"
  PASS=$((PASS + 1))
fi

AUTH="Authorization: Bearer $SUPER_TOKEN"

code=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$API/platform/health")
check "platform/health" "$code" "200"

code=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$API/platform/overview")
check "platform/overview" "$code" "200"

code=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$API/platform/schools")
check "platform/schools" "$code" "200"

# School admin login
ADMIN_JSON=$(curl -s -X POST "$API/auth/session" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demoschool.edu","password":"DemoAdmin123!"}')
ADMIN_TOKEN=$(echo "$ADMIN_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('token',''))" 2>/dev/null || true)
if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "  FAIL school admin login: $ADMIN_JSON"
  FAIL=$((FAIL + 1))
else
  echo "  OK  school admin login"
  PASS=$((PASS + 1))
fi

A_AUTH="Authorization: Bearer $ADMIN_TOKEN"
code=$(curl -s -o /dev/null -w "%{http_code}" -H "$A_AUTH" "$API/catalog/years?detailed=true")
check "catalog/years (tenant)" "$code" "200"

code=$(curl -s -o /dev/null -w "%{http_code}" -H "$A_AUTH" "$API/dashboard/stats")
check "dashboard/stats" "$code" "200"

# Tenant cannot access platform
code=$(curl -s -o /dev/null -w "%{http_code}" -H "$A_AUTH" "$API/platform/schools")
check "platform/schools blocked for school admin" "$code" "403"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]]
