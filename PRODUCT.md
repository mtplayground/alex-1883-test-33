# alex-1883-test-33

## What It Is

`alex-1883-test-33` is a photo-sharing web application scaffold with a React frontend and an Express backend. It supports the core social workflow: Google sign-in, authenticated image upload, post creation, profile display, follow relationships, personalized feed loading, likes, and comments.

## Current Capabilities

- Google OAuth backend callback flow upserts users by `google_id` and issues JWTs.
- JWT middleware protects backend routes and the frontend API client carries bearer tokens.
- User profiles expose avatar, email, display name, and nickname-friendly fields.
- Images upload through an S3-compatible Object Storage client with prefixed keys, concrete content length, and signed/public access URL support.
- Posts persist author, image URL, caption, and timestamps.
- Feed API returns the current user's posts plus followed users' posts in reverse chronological paginated order.
- Follow/unfollow APIs expose follower and following counts.
- Like/unlike APIs expose post like counts.
- Comment APIs create, list, and delete post comments.
- Frontend modules cover sign-in, auth state, profile display, image post composition, post cards, feed loading, follow toggles, like toggles, and comment threads.

## Architecture

- Node.js ESM npm workspace monorepo.
- `backend/` is the Express service, with `npm run dev:backend` and `npm run start` wiring the server to `0.0.0.0:8080` by default.
- `frontend/` is a React app powered by Vite, with `npm run dev:frontend` serving on `0.0.0.0:5173`.
- Persistent state is PostgreSQL only, accessed through Prisma and configured by `DATABASE_URL`.
- Object Storage is S3-compatible via AWS SDK v3 and configured only through environment variables.
- Configuration is centralized in `backend/src/config/app-config.mjs` and documented in `.env.example`.
- Shared API errors use the `ApiError` envelope and log unexpected 500s with name, code, message, and stack.

## Conventions

- Do not use SQLite, JSON-file persistence, in-memory storage, or ephemeral volumes for persistent state.
- Do not hardcode database, OAuth, JWT, or storage credentials.
- Use npm scripts from the root for validation, tests, database migration workflows, and workspace starts.
- Backend and frontend behavior is primarily covered by `node:test` contract tests; e2e tests run only when the required `E2E_*` environment variables are present.
