# Self-Hosting

This repository is prepared for a bare-directory deployment that runs from the checked-out source tree.

## Requirements

- Node.js 20 or newer.
- PostgreSQL 16 or newer for all persistent state.
- S3-compatible object storage for uploaded images.
- Google OAuth credentials for sign-in.

## Runtime Environment

Copy `.env.example` to the deployment environment and replace every placeholder value. Keep production env files out of git.

Required settings:

- `NODE_ENV`: use `production` for deployed instances.
- `HOST`: bind address. Use `0.0.0.0` in production.
- `PORT`: listen port. Use `8080` in production.
- `PUBLIC_APP_URL`: public origin of the web application.
- `DATABASE_URL`: PostgreSQL connection string. Do not use SQLite, JSON files, in-memory stores, or ephemeral volumes for persistent state.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`: Google OAuth configuration.
- `JWT_SECRET`: at least 32 random characters.
- `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY`, `OBJECT_STORAGE_PREFIX`: S3-compatible storage configuration.

Validate configuration before starting the app:

```bash
npm run validate:env -- --env-file .env.production
```

## Build

```bash
npm install
npm run build
```

The current build verifies the environment schema and the shared error response contract. Later feature issues should extend `npm run build` with frontend and backend compilation.

## Start

When the backend entrypoint is added, the production process should load `.env.production`, validate it, run PostgreSQL migrations, and listen on `0.0.0.0:8080`.

Recommended process manager command shape:

```bash
set -a
. ./.env.production
set +a
npm run validate:env
npm run build
npm run start
```

## Deployment Checklist

- Production env file exists outside git and passes `npm run validate:env`.
- `DATABASE_URL` points to PostgreSQL.
- Storage keys write under `OBJECT_STORAGE_PREFIX`.
- The process binds to `HOST=0.0.0.0` and `PORT=8080`.
- Unhandled 5xx errors are logged with name, code, message, stack, and request id before a generic response is returned.
- Database migrations run successfully before accepting traffic.
