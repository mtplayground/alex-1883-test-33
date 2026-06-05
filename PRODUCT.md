# alex-1883-test-33

## What It Is

`alex-1883-test-33` is a photo-sharing web application with a React frontend and an Express backend. The current merged product focuses on the authenticated web experience: routing, sign-in state, profile display, image-post composition, feed browsing, and post interactions.

## Current Capabilities

- The React app uses real routes for `/`, `/feed`, `/profile`, `/post/:id`, `/auth/google`, and `/auth/callback`.
- The global layout shows top navigation plus a right-side Sign in entry or signed-in user menu.
- Auth Context manages JWT-backed session loading, API client token attachment, sign-out, and Google sign-in redirects.
- Protected routes gate `/feed`, `/profile`, and `/post/:id`; signed-out users are sent to the Google sign-in start route, and signed-in users entering `/` are sent to the feed.
- The feed route combines image upload, post creation, paginated feed browsing, and links to post detail pages.
- The post detail route assembles the PostCard, author follow control, like button, and comment thread against the shared API client.
- The profile route displays the current user's avatar, email, name, and nickname-style fallback.
- `GET /` serves the built Vite frontend when `frontend/dist/index.html` exists, and the backend provides `/healthz` plus `/api/healthz`.
- Backend source modules and tests exist for Google OAuth, JWT auth, image uploads, posts, feed, follows, likes, and comments. The main Express app currently mounts health/static handling only; the domain API route modules are contract-tested but not yet composed into the production Express entrypoint.

## Architecture

- Node.js ESM npm workspace monorepo.
- `backend/` is the Express service; `npm run start` serves on `0.0.0.0:8080` by default.
- `frontend/` is a React app powered by Vite; `npm run dev:frontend` serves on `0.0.0.0:5173`.
- In production, the backend serves static files from `frontend/dist` and falls back to the frontend shell for non-API, extensionless routes.
- Persistent state is PostgreSQL only, accessed through Prisma 6.x and configured by `DATABASE_URL`.
- Object Storage is S3-compatible via AWS SDK v3 and configured only through environment variables.
- Configuration is centralized in `backend/src/config/app-config.mjs` and documented in `.env.example`.
- Shared API errors use the `ApiError` envelope and log unexpected 500s with name, code, message, and stack.

## Conventions

- Do not use SQLite, JSON-file persistence, in-memory storage, or ephemeral volumes for persistent state.
- Do not hardcode database, OAuth, JWT, or storage credentials.
- Use npm scripts from the root for validation, tests, database migration workflows, and workspace starts.
- Backend and frontend behavior is primarily covered by `node:test` contract tests; e2e tests run only when the required `E2E_*` environment variables are present.
