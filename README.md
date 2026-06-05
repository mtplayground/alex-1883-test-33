# alex-1883-test-33

## Project Structure

The repository is organized as two npm workspace projects:

- `backend/` contains the Express service. `npm run dev:backend` starts it with `node --watch` on
  `0.0.0.0:8080` by default, and `npm run start` runs the production entrypoint.
- `frontend/` contains the React app powered by Vite. `npm run dev:frontend` starts the local Vite
  server on `0.0.0.0:5173`, and `npm run build:frontend` creates a production build.
- Shared validation, tests, Prisma configuration, and scripts remain at the repository root.

## Development Tooling

This repository uses one root configuration for backend, frontend, scripts, and tests:

- `npm run typecheck` runs TypeScript in `allowJs`/`checkJs` mode across all `.mjs` sources.
- `npm run lint` runs ESLint flat config from `eslint.config.mjs`.
- `npm run format:check` checks Prettier formatting; `npm run format` rewrites files.
- `npm run check` combines build validation, type checking, linting, and formatting checks.
