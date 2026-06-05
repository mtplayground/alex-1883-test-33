# Database Migrations

Migrations in `backend/db/migrations/` are plain PostgreSQL SQL files. Run them against the configured PostgreSQL database in filename order.

Example:

```bash
set -a
. ./.env.production
set +a
psql "$DATABASE_URL" -f backend/db/migrations/20260605034500_create_comments.sql
```

Persistent application state must stay in PostgreSQL. Do not replace these migrations with SQLite, JSON files, in-memory stores, or ephemeral volumes.
