# Buyer Due Diligence Guide

This document supports technical review before acquisition or investment in this codebase.

## Product summary

Multi-tenant **School Management System** for Ethiopian/international K-12 style schools:

- Admin dashboard (React) + REST/GraphQL backend
- Roles: Platform admin, school admin, teacher, finance, parent, student
- Domains: academics, attendance, exams/grading, finance, resources, lesson planning

## What is included

| Asset | Location |
|-------|----------|
| Backend API | `Student_mangement_system_backend/` |
| Web frontend | `Student_mangement_system_director_dashbored/` |
| SQL migrations | `hasura/hasura/migrations/` |
| Hasura metadata | `hasura/hasura/metadata/` |
| Documentation | `docs/` |
| Tests | `tests/` (unit; expanding) |
| CI | `.github/workflows/ci.yml` |

## Maturity snapshot (honest)

| Area | Status |
|------|--------|
| Feature breadth | **Strong** — portals, grading workflow, finance |
| Architecture | **Good** — clear layers, Hasura + Express split |
| Multi-tenancy | **Implemented** — requires audit before scale |
| Automated tests | **Basic** — grade engine, auth guards, policies |
| API documentation | **Index** — REST catalog in API_REFERENCE.md |
| CI/CD | **GitHub Actions** — test + migration lint |
| Production ops | **Documented** — DEPLOYMENT.md; monitoring not bundled |

**Recommended before premium sale:** external security audit, integration test suite (>60% critical paths), OpenAPI generation, load test.

## Review checklist

### Security

- [ ] Read [SECURITY.md](./SECURITY.md)
- [ ] Run `npm run audit:tenant` — review SQL without `school_id`
- [ ] Verify JWT secret rotation procedure
- [ ] Test cross-tenant access on parent/student portal IDs
- [ ] Confirm Hasura row permissions match Express rules

### Data

- [ ] Read [DATABASE.md](./DATABASE.md)
- [ ] Run migrations on staging clone (`migrate-neon-psql.sh`)
- [ ] Validate backup/restore on Neon or Postgres

### Legal

- [ ] Confirm [LICENSE](../LICENSE) (MIT as shipped — adjust if needed)
- [ ] Third-party dependency licenses (`npm ls --all`)
- [ ] No proprietary data in repo (seed scripts use demo emails only)

### Code quality

- [ ] `npm test` passes
- [ ] No `.env` or secrets in git history (`git log -p -- .env`)
- [ ] Dependencies: `npm audit` (fix critical)

## Demo credentials (after seed)

| Role | Email | Password |
|------|-------|----------|
| School admin | `admin@demoschool.edu` | `DemoAdmin123!` |
| Teacher | `teacher01@demo.local` | `Teacher123!` |
| Student | `DEMO-G9A-001@demo.local` | `Student123!` |
| Parent | `test-parent@gmail.com` | `Parent123!` |

## Known limitations (disclosed)

1. **Not microservices** — single Express deployment; README no longer claims otherwise
2. **No Prisma** — raw SQL via `pg` + Hasura migrations
3. **Student fee payment** — parent portal only (Chapa); students read-only
4. **Test coverage** — growing; not enterprise-grade yet
5. **Dual migration trackers** — `sms_dev_migrations` + Hasura catalog (documented in DEPLOYMENT.md)

## Suggested valuation drivers

**Increases value**

- Working grading pipeline with portal visibility rules
- Incremental Neon migration tooling
- Mobile API documentation (STUDENT_MOBILE_APP.md)
- Dockerized dev environment

**Requires investment**

- Penetration test
- Integration tests for finance + grading
- OpenAPI / Postman collection
- Observability stack (Sentry, metrics)

## Contact

Maintainer: Wubishet Wudu — see root README.
