# Hasura configuration and quick start

This folder contains minimal guidance for managing Hasura metadata and migrations for this project.

Recommended workflow (local development):

1. Install Hasura CLI on your machine:

```bash
curl -L https://github.com/hasura/graphql-engine/raw/stable/cli/get.sh | bash
hasura version
```

2. Initialize a Hasura project (if you want to manage metadata/migrations here):

```bash
cd hasura
hasura init .
```

3. Configure `config.yaml` to point to your Hasura instance and set `HASURA_GRAPHQL_ADMIN_SECRET`.

4. Export metadata and migrations frequently and commit the `metadata/` and `migrations/` folders:

```bash
hasura metadata export
hasura migrate create "from-server" --from-server
hasura migrate apply --all-databases
```

Notes:
- Schema is managed via **Hasura SQL migrations** in `hasura/migrations/` (not Prisma).
- For incremental deploys to Neon, use `scripts/migrate-neon-psql.sh` from the backend root.
- Keep backups of your DB before making destructive schema changes.
