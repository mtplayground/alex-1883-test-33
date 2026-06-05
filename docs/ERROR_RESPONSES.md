# Error Responses

All HTTP API errors should use one JSON envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": {
      "field": "email"
    },
    "requestId": "req_..."
  }
}
```

Rules:

- `code` is a stable machine-readable identifier in `SCREAMING_SNAKE_CASE`.
- `message` is safe to show to users for 4xx errors.
- `details` is optional and should contain structured validation or conflict context.
- `requestId` is optional, but production handlers should include it when one is available.
- Unhandled 5xx responses must return `INTERNAL_SERVER_ERROR` with the generic message `Internal server error`.
- Error handlers must log the original error before returning a generic 5xx. The log must include name, code, message, stack, and request id when available.

Recommended status mapping:

| Status | Code |
| --- | --- |
| 400 | `VALIDATION_ERROR` |
| 401 | `UNAUTHENTICATED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_SERVER_ERROR` |

The repository includes `scripts/error-response.mjs` as the current canonical error response helper until backend issue work introduces the Express application tree.
