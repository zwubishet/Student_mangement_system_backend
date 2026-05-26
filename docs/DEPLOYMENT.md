# Deployment Guide

## Components

| Component | Role |
|-----------|------|
| Express API | `npm start` → port `PORT` (default 3003) |
| PostgreSQL | Primary datastore (Neon, RDS, or self-hosted) |
| Redis | JWT blacklist (optional but recommended for logout) |
| Hasura | GraphQL engine (optional if REST-only) |

## Environment variables

See [`.env.example`](../.env.example). Minimum production set:

```env
NODE_ENV=production
PORT=3003
DATABASE_URL=postgresql://...
ACCESS_TOKEN_SECRET=<random-64-chars>
ACTION_SECRET=<random-64-chars>
REDIS_URL=rediss://...
CORS_ORIGIN=https://your-dashboard.example.com
```

## Docker (local / single VM)

```bash
./scripts/sms-dev.sh up
./scripts/sms-dev.sh migrate-psql
./scripts/sms-dev.sh seed   # optional demo data
```

Production: build the `app` service image from project Dockerfile/compose, inject env via secrets manager.

## Neon (managed Postgres)

1. Create Neon project; use **direct** connection string for migrations (not pooler).
2. First time on existing schema:

```bash
export NEON_DATABASE_URL='postgresql://...@ep-xxx.c-7.region.aws.neon.tech/neondb?sslmode=require'
bash scripts/bootstrap-neon-migrations.sh   # if schema already exists
bash scripts/migrate-neon-psql.sh           # apply only NEW migrations
```

3. Hasura metadata (optional):

```bash
./scripts/migrate-to-neon.sh   # SQL + metadata sync
```

## Hasura Cloud

1. Connect Hasura project to same Neon `DATABASE_URL`
2. Apply metadata from `hasura/hasura/metadata`
3. Set `HASURA_GRAPHQL_JWT_SECRET` to match `ACCESS_TOKEN_SECRET` format Hasura expects
4. Point Actions base URL to your Express deployment

## Health checks

| Endpoint | Use |
|----------|-----|
| `GET /health` | Load balancer liveness |
| `GET /api/v1/meta` | Deploy verification (module list) |

## Graceful shutdown

The server handles `SIGTERM` / `SIGINT` and closes the HTTP listener before exit (Kubernetes-friendly).

## Backups

- Enable Neon PITR or Postgres WAL backups
- Test restore quarterly
- Export Hasura metadata to git on every schema change

## Migrations in CI/CD

```bash
bash scripts/migrate-neon-psql.sh
# then deploy new API version
```

Never run `RESET_NEON_MIGRATIONS=1` against production.

## Monitoring (recommended)

- **Sentry** or similar for Express error tracking
- Log aggregation for JSON request logs (`NODE_ENV=production`)
- Postgres slow query log
- Uptime on `/health`

## Frontend

Deploy `Student_mangement_system_director_dashbored` as static SPA (Vercel, Netlify, S3+CloudFront). Set:

```env
VITE_API_URL=https://api.yourdomain.com
```
