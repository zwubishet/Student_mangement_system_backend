# Architecture

## Overview

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐
│ Web / Mobile │────►│ Express REST    │────►│ PostgreSQL       │
│  Dashboard   │     │ /api/v1/*       │     │ (multi-schema)   │
└──────┬───────┘     └────────┬────────┘     └────────▲─────────┘
       │                      │                        │
       │              ┌───────▼────────┐               │
       └─────────────►│ Hasura GraphQL │───────────────┘
                      │ + Actions      │
                      └───────┬────────┘
                              │
                      ┌───────▼────────┐
                      │ Redis          │
                      │ JWT blacklist  │
                      └────────────────┘
```

This is a **modular monolith**: one Express process and one Hasura instance per deployment — not decomposed microservices, but boundaries are clear for future extraction.

## Request paths

### REST (`/api/v1`)

Used by the React dashboard and mobile clients.

1. `restrictBlacklisted` — Redis check for logged-out JWTs
2. `requestLogger` — structured access logs
3. Route-level `requireTenant` — JWT verify, populate `req.tenant`
4. Route-level `requireRole(...)` — STUDENT, PARENT, TEACHER, etc.
5. Controller → Service → `pg` queries (parameterized)

### Hasura GraphQL

Used for CRUD and subscriptions where configured. Complex workflows invoke **Actions** hitting Express with `x-hasura-action-secret` and `session_variables`.

### Authentication

- Login: `POST /api/v1/auth/session` → JWT with Hasura claims
- Claims include `x-hasura-user-id`, `x-hasura-school-id`, `x-hasura-allowed-roles`
- Logout: blacklist token in Redis

## Database schemas

| Schema | Responsibility |
|--------|----------------|
| `tenancy` | Schools, platform settings |
| `identity` | Users, roles, permissions, audit |
| `academic` | Catalog, teachers, parents, enrollments |
| `student` | Student profiles, documents |
| `operations` | Exams, marks, announcements, grading |
| `finance` | Invoices, payments, payroll |
| `library` | Digital resources |
| `planning` | Lesson plans, continuous assessment |
| `infrastructure` | File metadata |

See [DATABASE.md](./DATABASE.md).

## Key modules (Express)

| Path prefix | Module |
|-------------|--------|
| `/catalog` | Academic years, terms, grades, timetable |
| `/students`, `/teachers` | Roster CRUD (admin) |
| `/exams`, `/grading` | Exam lifecycle & mark workflow |
| `/finance` | Billing, payroll, Chapa |
| `/student-portal` | Student self-service |
| `/parent-portal` | Parent children, grades, fees |
| `/teacher-portal` | Mark entry, attendance, classes |
| `/resources` | Learning materials |
| `/super-admin`, `/platform` | Platform operators |

## Consistency

- Financial and grading writes use `BEGIN` / `COMMIT` via `getClient()` where multiple tables must stay aligned
- Hasura migrations are source of schema truth (`hasura/hasura/migrations/`)
- Local/Neon incremental apply via `public.sms_dev_migrations` tracker

## What this architecture optimizes for

- **Per-school isolation** in a shared database
- **Complex school rules** (terms, sections, weighted grades) in TypeScript services
- **Fast admin UI** via GraphQL where appropriate
- **Explicit REST** for portals and mobile

## Related docs

- [SECURITY.md](./SECURITY.md)
- [DEPLOYMENT.md](./DEPLOYMENT.md)
- [GRADING_SYSTEM.md](./GRADING_SYSTEM.md)
