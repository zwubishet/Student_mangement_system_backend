# Public Review Readiness

Checklist before publishing this repository for buyers, contributors, or open source.

## Repository hygiene

- [x] `.env.example` — no real secrets
- [x] `.gitignore` — `.env`, `uploads/`, `node_modules/`
- [x] `LICENSE` (MIT — change if needed)
- [x] Root + backend README accurate (no Prisma / microservices claims)
- [x] `CONTRIBUTING.md`

## Documentation

- [x] [ARCHITECTURE.md](./ARCHITECTURE.md)
- [x] [SECURITY.md](./SECURITY.md)
- [x] [DEPLOYMENT.md](./DEPLOYMENT.md)
- [x] [DATABASE.md](./DATABASE.md)
- [x] [API_REFERENCE.md](./API_REFERENCE.md)
- [x] [BUYER_DUE_DILIGENCE.md](./BUYER_DUE_DILIGENCE.md)

## Engineering

- [x] GitHub Actions CI (tests + migration sanity)
- [x] `npm test` (Node built-in test runner)
- [x] `npm run audit:tenant` heuristic script
- [x] Removed unused `bcrypt` dependency
- [x] Request logging + graceful shutdown
- [ ] OpenAPI spec (future)
- [ ] Integration tests with test DB (future)

## Before tagging a release

1. Rotate any secrets that ever appeared in git or chat
2. Run full seed on clean DB and smoke-test portals
3. `npm audit fix` for critical CVEs
4. Tag version + release notes
