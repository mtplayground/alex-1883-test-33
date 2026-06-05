#!/usr/bin/env node

import assert from "node:assert/strict";
import { ApiError, logUnhandledError, toErrorResponse } from "./error-response.mjs";

const requestId = "req_test";
const clientError = toErrorResponse(
  new ApiError(400, "VALIDATION_ERROR", "Invalid request", { field: "email" }),
  requestId,
);

assert.equal(clientError.status, 400);
assert.deepEqual(clientError.body, {
  error: {
    code: "VALIDATION_ERROR",
    message: "Invalid request",
    details: { field: "email" },
    requestId,
  },
});

const serverError = toErrorResponse(new Error("database unavailable"), requestId);
assert.equal(serverError.status, 500);
assert.deepEqual(serverError.body, {
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Internal server error",
    requestId,
  },
});

let logged = null;
logUnhandledError(Object.assign(new Error("database unavailable"), { code: "ECONNREFUSED" }), requestId, {
  error(message, metadata) {
    logged = { message, metadata };
  },
});

assert.equal(logged.message, "Unhandled application error");
assert.equal(logged.metadata.requestId, requestId);
assert.equal(logged.metadata.name, "Error");
assert.equal(logged.metadata.code, "ECONNREFUSED");
assert.equal(logged.metadata.message, "database unavailable");
assert.match(logged.metadata.stack, /database unavailable/);

console.log("error response contract is valid");
