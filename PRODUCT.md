# alex-1883-test-33

## What It Is

`alex-1883-test-33` is a photo-sharing web application with a React frontend and an Express backend. The current merged product supports an authenticated social photo workflow: Google sign-in, profile display, image-post composition, feed browsing, post detail, follows, likes, and comments. Production deployment must run with real PostgreSQL and, when image uploads or Google sign-in are enabled, real external service credentials.

## Current Capabilities

- The React app uses real routes for `/`, `/feed`, `/profile`, `/post/:id`, `/auth/google`, and `/auth/callback`.
- The global layout shows top navigation plus a right-side Sign in entry or signed-in user menu.
- Auth Context manages JWT-backed session loading, API client token attachment, sign-out, and Google sign-in redirects.
- Protected routes gate `/feed`, `/profile`, and `/post/:id`; signed-out users see an in-app sign-in-required state with a Google sign-in action, and signed-in users entering `/` are sent to the feed.
- The feed route combines image upload, post creation, paginated API-backed feed browsing, and links to post detail pages.
- The post detail route loads `GET /api/posts/:id` and assembles the PostCard, author follow control, like button, and comment thread against the shared API client.
- The profile route displays the current user's avatar, email, name, and nickname-style fallback.
- `GET /` serves the built Vite frontend when `frontend/dist/index.html` exists, and the backend provides `/healthz` plus `/api/healthz`.
- The main Express app mounts all domain routes under `/api`: Google OAuth/current user, image uploads, posts, feed, follows, likes, and comments.
- Google OAuth and image upload integrations fail closed with `FEATURE_UNAVAILABLE` when the corresponding real credentials are not configured; the app does not ship fabricated external-service credentials.
- The upload-to-post-to-feed-to-like/comment/follow workflow is covered by an environment-gated E2E smoke test.

## Architecture

- Node.js ESM npm workspace monorepo.
- `backend/` is the Express service; `npm run start` serves on `0.0.0.0:8080` by default.
- `frontend/` is a React app powered by Vite; `npm run dev:frontend` serves on `0.0.0.0:5173`.
- In production, the backend serves static files from `frontend/dist` and falls back to the frontend shell for non-API, extensionless routes.
- Persistent state is PostgreSQL only. Migrations/schema are managed with Prisma, while runtime repositories use `pg` query clients configured by `DATABASE_URL`.
- User-uploaded images are stored in S3-compatible object storage via AWS SDK v3 when object storage is configured. Uploads are buffered before storage, use concrete `ContentLength`, and object keys are scoped through the configured storage prefix.
- Configuration is centralized in `backend/src/config/app-config.mjs` and documented in `.env.example`.
- Shared API errors use the `ApiError` envelope and log unexpected 500s with name, code, message, and stack.

## Conventions

- Do not use SQLite, JSON-file persistence, in-memory storage, or ephemeral volumes for persistent state.
- Do not hardcode database, OAuth, JWT, or storage credentials.
- Use npm scripts from the root for validation, tests, database migration workflows, and workspace starts.
- Backend and frontend behavior is primarily covered by `node:test` contract tests; e2e tests run only when the required `E2E_*` environment variables are present.
