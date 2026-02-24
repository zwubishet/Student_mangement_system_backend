#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/apply_prisma_migrations.sh [container-name]
# Defaults to student_mangement_system_backend-postgres-1 if no arg provided.

CONTAINER=
if [ "$#" -ge 1 ]; then
  CONTAINER="$1"
else
  CONTAINER="student_mangement_system_backend-postgres-1"
fi

DB_USER=${DB_USER:-sms_user}
DB_NAME=${DB_NAME:-sms_db}

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "Postgres container '${CONTAINER}' is not running. Run 'docker-compose up -d' first or pass correct container name." >&2
  exit 2
fi

echo "Using container: ${CONTAINER} (DB=${DB_NAME} USER=${DB_USER})"

echo "Waiting for Postgres to accept connections..."
ready=0
for i in {1..30}; do
  if docker exec "${CONTAINER}" pg_isready -U "${DB_USER}" -d "${DB_NAME}" >/dev/null 2>&1; then
    echo "Postgres is ready (after $i checks)"
    ready=1
    break
  fi
  echo "  - Postgres not ready yet ($i/30). Waiting 2s..."
  sleep 2
done
if [ "$ready" -ne 1 ]; then
  echo "Postgres did not become ready in time. Check container logs: docker-compose logs -f postgres" >&2
  exit 3
fi

applied=0
for f in prisma/migrations/*/migration.sql; do
  if [ -f "$f" ]; then
    echo "---- Applying $f ----"
    # Use docker exec -i and psql reading from stdin
    docker exec -i "${CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -f - < "$f" || {
      echo "Failed applying $f" >&2
      exit 1
    }
    applied=$((applied+1))
  else
    # no-op when glob doesn't match
    :
  fi
done

if [ "$applied" -eq 0 ]; then
  echo "No migration files found under prisma/migrations/*/migration.sql"
else
  echo "Applied $applied migration(s)."
fi

echo "You can now open the Hasura console (host port depends on your docker-compose mapping)."
echo "Example: http://localhost:8082 (or your mapped port)"
