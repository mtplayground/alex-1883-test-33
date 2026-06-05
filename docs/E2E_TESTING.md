# End-to-End Testing

The E2E workflow test covers the planned user path:

1. Authenticate with an existing token and verify `/me`.
2. Upload an image through `/uploads/images`.
3. Create a post through `/posts`.
4. Follow another user through `/users/:id/follow`.
5. Load `/feed` and verify the new post appears.
6. Like the post and verify the like count.
7. Create a comment and verify it appears in the comment list.
8. Clean up comment, like, and follow state where the API supports those operations.

Run the suite:

```bash
npm run test:e2e
```

The test skips unless these variables are present:

- `E2E_BASE_URL`: base URL of a running application instance.
- `E2E_AUTH_TOKEN`: bearer token for a test user.
- `E2E_FOLLOW_USER_ID`: id of a second user that the test user can follow.

Example:

```bash
E2E_BASE_URL=http://127.0.0.1:8080 \
E2E_AUTH_TOKEN=replace-with-test-token \
E2E_FOLLOW_USER_ID=replace-with-second-user-id \
npm run test:e2e
```

The test uses the public HTTP API and relies on the deployed application to persist state in PostgreSQL. It does not create in-memory stores, JSON files, SQLite databases, or local fixture databases.
