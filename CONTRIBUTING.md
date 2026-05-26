# Contributing

Thank you for reviewing or contributing to the School Management System.

## Development setup

```bash
cd Student_mangement_system_backend
cp .env.example .env
./scripts/sms-dev.sh up
./scripts/sms-dev.sh migrate-psql
./scripts/sms-dev.sh seed
npm run dev
```

Frontend (separate terminal):

```bash
cd Student_mangement_system_director_dashbored
npm install && npm run dev
```

## Before opening a PR

1. `npm test` — all tests pass
2. `npm run audit:tenant` — no new unscoped SQL warnings (or justify in PR)
3. No secrets in commits
4. Update docs if you add routes or change auth behavior

## Code conventions

- ES modules (`import` / `export`)
- Business logic in `src/services/`, thin controllers
- Parameterized SQL only
- Use `AppError` + `catchAsync` for HTTP errors
- Transactions (`getClient` + `BEGIN`) for multi-table writes

## Migrations

- Add SQL under `hasura/hasura/migrations/<timestamp>_<name>/up.sql`
- Test locally: `./scripts/sms-dev.sh migrate-psql`
- For Neon: `bash scripts/migrate-neon-psql.sh`

## Security

Report vulnerabilities privately to the maintainer — do not open public issues for exploit details.
