# Database Migrations

Prisma is configured in `prisma/schema.prisma` with a PostgreSQL datasource that reads `DATABASE_URL` from the environment. The Prisma migration baseline lives in `prisma/migrations/`.

Generate the client after installing dependencies:

```bash
npm run prisma:generate
```

Apply migrations to a managed PostgreSQL database:

```bash
set -a
. ./.env.production
set +a
npm run db:migrate
```

Create local development migrations from schema changes:

```bash
export DATABASE_URL=postgresql://user:password@localhost:5432/alex_1883_test_33
npm run db:migrate:dev
```

The legacy SQL files in `backend/db/migrations/` mirror the same PostgreSQL schema and remain useful for review and service-level tests. If you run them manually, apply them in filename order.

```bash
set -a
. ./.env.production
set +a
psql "$DATABASE_URL" -f backend/db/migrations/20260605034500_create_comments.sql
```

Persistent application state must stay in PostgreSQL. Do not replace these migrations with SQLite, JSON files, in-memory stores, or ephemeral volumes.
