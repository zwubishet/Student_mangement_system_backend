# School Management — Backend

PostgreSQL · Express (`api/`) · Hasura · Redis

Run all commands from **this directory**.

## Layout

| Path | Purpose |
|------|---------|
| `api/src/` | REST API (routes → controllers → services) |
| `hasura/` | SQL migrations + GraphQL metadata |
| `docker/docker-compose.yml` | Local Postgres, Redis, Hasura, optional API container |
| `scripts/` | CLI (`./scripts/sms`), stack, db, seeds, qa, workers |

Entry: `server.js` → `api/src/server.js` · API base: `/api/v1`

## First time

```bash
cp .env.example .env
npm install
npm run hasura:up
```

Open **http://localhost:8082/console** (admin secret: `HASURA_GRAPHQL_ADMIN_SECRET` in `.env`, default `supersecret`).

```bash
npm run db:seed    # optional demo users
npm run dev        # API on host (port from .env, often 3003)
```

## npm commands

Run `./scripts/sms help` or `npm run sms` for the full list.

| Command | Action |
|---------|--------|
| `hasura:up` | Postgres + Redis + Hasura, migrate + metadata |
| `hasura:down` | Stop stack |
| `console` | Hasura CLI console |
| `stack:*` | Docker up/down/logs/restart (`stack:logs:hasura`, …) |
| `db:*` | setup, migrate, status, seed, reset |
| `seed:*` | Single seed module (`school`, `super`, `demo`, …) |
| `qa:smoke` / `qa:audit-tenant` | API smoke test / tenant SQL audit |
| `dev:chapa` | Local Chapa migration helper |
| `worker:compute` | Grading computation worker |
| `dev` / `start` / `test` | API dev / prod / unit tests |

## URLs (local)

| Service | URL |
|---------|-----|
| Hasura console | http://localhost:8082/console |
| GraphQL | http://localhost:8082/v1/graphql |
| REST API | http://localhost:3003/api/v1 |
| Health | http://localhost:3003/health |

## Environment

Required in `.env`: `DATABASE_URL`, `ACCESS_TOKEN_SECRET`, `ACTION_SECRET`.

Do not use default `supersecret` in production.

## Hasura actions (production model)

| Concern | Implementation |
|---------|----------------|
| Webhook URL | `HASURA_GRAPHQL_ACTIONS_HANDLER_WEBHOOK_BASEURL` ← `HASURA_ACTION_BASE_URL` in `.env` |
| Docker stack | `http://app:3003` (service name, not `localhost`) |
| API on host | `http://host.docker.internal:3003` + `docker/compose.host-api.yml` |
| Action auth | Header `x-hasura-action-secret` from `value_from_env: ACTION_SECRET` (same on API + Hasura) |
| Login | `LoginAction` → `POST /api/v1/auth/login` (role `anonymous`) |
| SPA login | Prefer `POST /api/v1/auth/session` (no webhook) |

```bash
npm run hasura:up          # stack + migrate + webhook verify
npm run hasura:verify      # Hasura container → API /health
npm run db:migrate         # after metadata changes
```
