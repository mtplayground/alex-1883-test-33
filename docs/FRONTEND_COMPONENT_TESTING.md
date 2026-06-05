# Frontend Component Testing

The frontend component test command is:

```bash
npm run test:frontend
```

The current repository does not yet include the React component tree. Until those files exist, `tests/frontend/component-contract.test.mjs` records executable coverage contracts for the required component groups:

- Login state: loading, signed-out, signed-in, and error states.
- Image posting: idle, preview, submitting, success, and error states.
- Feed: loading, empty, populated, next-page loading, and error states.
- Interactions: follow, unfollow, like, unlike, comment submit, and comment error states.

Future React component tests should keep this command and replace or extend the contract tests with mounted component tests. The required behaviors in the contract file should remain covered so regressions in auth state, image posting, feed rendering, and post interactions are caught by `npm test`.
