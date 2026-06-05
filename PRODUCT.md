# alex-1883-test-33

## What It Is

`alex-1883-test-33` is a photo-sharing web application scaffold with a React frontend and an Express backend. The deployed app currently serves a styled React status shell from the backend root and exposes backend health checks.

## Current Capabilities

- `GET /` serves the built Vite frontend when `frontend/dist/index.html` exists.
- `GET /healthz` and `GET /api/healthz` return JSON service health.
- Unknown API/backend paths return the shared JSON `ApiError` envelope.
- The React shell displays the project name and readiness status with CSS loaded from the Vite build.
- Source modules and tests exist for the broader photo-sharing workflow: Google OAuth, JWT auth, user profiles, image upload, posts, feeds, follows, likes, and comments. These modules are not currently mounted by the main Express app.

## Architecture

- Node.js ESM npm workspace monorepo.
- `backend/` is the Express service, with `npm run dev:backend` and `npm run start` wiring the server to `0.0.0.0:8080` by default.
- `frontend/` is a React app powered by Vite, with `npm run dev:frontend` serving on `0.0.0.0:5173`.
- In production, the backend serves static files from `frontend/dist` and falls back to the frontend shell for non-API, extensionless routes.
- Persistent state is PostgreSQL only, accessed through Prisma and configured by `DATABASE_URL`.
- Object Storage is S3-compatible via AWS SDK v3 and configured only through environment variables.
- Configuration is centralized in `backend/src/config/app-config.mjs` and documented in `.env.example`.
- Shared API errors use the `ApiError` envelope and log unexpected 500s with name, code, message, and stack.

## Conventions

- Do not use SQLite, JSON-file persistence, in-memory storage, or ephemeral volumes for persistent state.
- Do not hardcode database, OAuth, JWT, or storage credentials.
- Use npm scripts from the root for validation, tests, database migration workflows, and workspace starts.
- Backend and frontend behavior is primarily covered by `node:test` contract tests; e2e tests run only when the required `E2E_*` environment variables are present.
