# Security Model

## Threat model (summary)

- **Multi-tenant data leak** — highest risk: School A must never read School B data
- **Privilege escalation** — student/parent must not access admin routes
- **Token theft** — JWT in `Authorization: Bearer`; HTTPS required in production
- **Hasura admin secret** — full DB access if exposed

## Tenant isolation

### JWT claims (Hasura-compatible)

After login, tokens include:

```json
{
  "https://hasura.io/jwt/claims": {
    "x-hasura-user-id": "<uuid>",
    "x-hasura-school-id": "<uuid>",
    "x-hasura-default-role": "STUDENT",
    "x-hasura-allowed-roles": ["STUDENT"]
  }
}
```

### Express REST

- `requireTenant` middleware verifies JWT and sets `req.tenant.schoolId`
- Services **must** filter by `school_id` (and verify parent/student links on portal routes)
- Portal routes resolve the actor from `user_id` — never trust client-supplied student IDs without access checks

### Super admin school impersonation

`SUPER_ADMIN` may send header `X-Tenant-School-Id` to operate as a school. Logged as `isPlatformManage` in code paths that bypass role checks — use only on trusted admin tooling.

## Authentication

| Mechanism | Detail |
|-----------|--------|
| Password hashing | `bcryptjs` (cost factor 12 in registration flows) |
| Session | Stateless JWT, ~24h expiry |
| Logout | Redis key `blacklist:<token>` until TTL |
| Hasura Actions | Header `x-hasura-action-secret` must match `ACTION_SECRET` |

## Authorization

| Layer | Enforcement |
|-------|-------------|
| Route | `requireRole('STUDENT')`, etc. |
| Fine-grained | `requirePermission('finance.read')` on some admin routes |
| Data | SQL `WHERE school_id = $1` + portal link tables |

## Input validation

- Joi schemas on selected routes (`validate` middleware)
- Parameterized SQL only (`pg` placeholders) — no string-concatenated user input in queries
- JSON body limit 8MB (`express.json`)

## HTTP hardening

- `helmet()` security headers
- CORS allowlist via `CORS_ORIGIN` (avoid `*` in production)
- Rate limits: 500 req / 15 min API; 20 / 15 min on `/auth/session`

## Secrets management

| Variable | Purpose |
|----------|---------|
| `ACCESS_TOKEN_SECRET` | JWT signing (min 32 random chars) |
| `ACTION_SECRET` | Hasura → Express action webhooks |
| `HASURA_GRAPHQL_ADMIN_SECRET` | Hasura console/API admin |
| `DATABASE_URL` | Postgres credentials |

**Never commit `.env`.** Use `.env.example` as template. Rotate secrets if exposed.

## Grading visibility (student/parent)

Marks appear in portals only when:

1. `operations.exams.status = 'PUBLISHED'`
2. `operations.examresults.mark_status IN ('verified', 'locked')`

Draft/submitted marks are intentionally hidden.

## Audit logging

- `identity.audit_logs` / `identity.platform_audit_logs` for admin actions
- `operations.mark_review_log` for mark status transitions
- Finance modules call `audit()` / `auditLog()` on sensitive writes

## Pre-production checklist

- [ ] Unique strong secrets for all environments
- [ ] HTTPS termination (reverse proxy or platform)
- [ ] Redis secured (password, private network)
- [ ] Hasura console disabled or IP-restricted in production
- [ ] Run `npm run audit:tenant` and review warnings
- [ ] Third-party penetration test for multi-tenant paths
- [ ] Database backups + restore drill

## Reporting vulnerabilities

If you discover a security issue, email the maintainer privately before public disclosure.
