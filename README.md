# alex-1883-test-33

## Development Tooling

This repository uses one root configuration for backend, frontend, scripts, and tests:

- `npm run typecheck` runs TypeScript in `allowJs`/`checkJs` mode across all `.mjs` sources.
- `npm run lint` runs ESLint flat config from `eslint.config.mjs`.
- `npm run format:check` checks Prettier formatting; `npm run format` rewrites files.
- `npm run check` combines build validation, type checking, linting, and formatting checks.
