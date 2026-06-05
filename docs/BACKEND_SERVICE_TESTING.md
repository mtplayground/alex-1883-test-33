# Backend Service Unit Testing

The backend service test command is:

```bash
npm run test:backend
```

The repository does not yet include the backend service implementation. Until those files exist, `tests/backend/service-contract.test.mjs` records executable unit-test coverage contracts for the required service groups:

- Auth: Google callback handling, user upsert, JWT issue/verify, and authenticated user lookup.
- Posts: post creation, post lookup, user post listing, author validation, and caption/image validation.
- Follows: follow, unfollow, follower/following counts, idempotency, duplicate handling, and self-follow rejection.
- Likes: like, unlike, like counts, idempotency, duplicate handling, and unknown post rejection.
- Comments: create, list, delete, author-only deletion, content validation, and post validation.

Future backend service tests should keep this command and replace or extend the contract tests with direct service unit tests. Service tests should mock external providers such as Google OAuth and object storage, but persistent application state must remain PostgreSQL-backed in implementation and integration paths.
