# School Management System — Backend API

Multi-tenant school SaaS backend: **PostgreSQL** (source of truth), **Express** (REST + Hasura Actions), **Hasura** (GraphQL + permissions), **Redis** (JWT logout blacklist).

> **Stack note:** This project uses the native `pg` driver and Hasura SQL migrations.

## Features

- Multi-tenant schools (`tenancy.schools`) with JWT claims `x-hasura-school-id`
- Academic catalog: years, terms, grades, sections, classes, subjects, timetable
- Students & teachers with enrollments and assignments
- Attendance, exams, grading workflow (draft → submit → verify → lock → publish)
- Finance: invoices, payments (Chapa for parents)
- Portals: `/student-portal`, `/parent-portal`, `/teacher-portal`
- Resource library, lesson planning, platform super-admin

## Documentation

| Doc | Purpose |
|-----|---------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design |
| [SECURITY.md](docs/SECURITY.md) | Auth, tenancy, secrets |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Docker, Neon, Hasura Cloud |
| [DATABASE.md](docs/DATABASE.md) | Schema overview |
| [API_REFERENCE.md](docs/API_REFERENCE.md) | REST route index |
| [BUYER_DUE_DILIGENCE.md](docs/BUYER_DUE_DILIGENCE.md) | Sale / audit checklist |
| [PUBLIC_REVIEW.md](docs/PUBLIC_REVIEW.md) | Pre-publish checklist |
| [GRADING_SYSTEM.md](docs/GRADING_SYSTEM.md) | Exams & marks |
| [STUDENT_MOBILE_APP.md](docs/STUDENT_MOBILE_APP.md) | Mobile integration |

## Quick start

```bash
cp .env.example .env
./scripts/sms-dev.sh up
./scripts/sms-dev.sh migrate-psql
./scripts/sms-dev.sh seed
npm run dev
```

| Service | URL |
|---------|-----|
| REST API | http://localhost:3003/api/v1 |
| Health | http://localhost:3003/health |
| Hasura console | http://localhost:8082 |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | API with nodemon |
| `npm test` | Unit tests (Node test runner) |
| `npm run audit:tenant` | Heuristic SQL tenancy audit |
| `./scripts/sms-dev.sh migrate-psql` | Apply migrations (local Docker Postgres) |
| `bash scripts/migrate-neon-psql.sh` | Incremental migrations on Neon |
| `bash scripts/bootstrap-neon-migrations.sh` | Mark existing Neon schema as migrated (one-time) |

## Environment

Copy [`.env.example`](.env.example). **Required:** `DATABASE_URL`, `ACCESS_TOKEN_SECRET`, `ACTION_SECRET`.

Do not use default secrets (`supersecret`) in production.

## Project status

Production-hardening in progress: CI, expanded tests, buyer documentation. Suitable as a **strong foundation** for school SaaS; complete security audit and integration tests before premium commercial sale.

## Author

Wubishet Wudu — [wubishetwudu1624@gmail.com](mailto:wubishetwudu1624@gmail.com)
