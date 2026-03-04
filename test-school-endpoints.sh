#!/bin/bash
# quick manual test script for school service
# assumes server running on localhost:3000
# and you have a super_admin token stored in SUPER_TOKEN

set -e

if [ -z "$SUPER_TOKEN" ]; then
  echo "Please export SUPER_TOKEN with a valid super_admin access token"
  exit 1
fi

base="http://localhost:3001/school/action/manageSchool"

echo "Creating a school..."
resp=$(curl -s -X POST $base \
  -H "Authorization: Bearer $SUPER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"create","name":"Test School","code":"TS001","address":"1 Test St"}')
echo "$resp"

schoolId=$(echo "$resp" | jq -r '.school.id')
echo "School id: $schoolId"

echo "Updating the school address..."
curl -s -X POST $base \
  -H "Authorization: Bearer $SUPER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"update","schoolId":"'$schoolId'","address":"42 Updated Ave"}'

echo -e "\nDeleting school..."
curl -s -X POST $base \
  -H "Authorization: Bearer $SUPER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"delete","schoolId":"'$schoolId'"}'

echo -e "\nDone."
