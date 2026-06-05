import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../../scripts/error-response.mjs";
import {
  createJwtService,
  normalizeJwtUser,
  signJwt,
  verifyJwt,
} from "../../backend/src/auth/jwt-service.mjs";
import {
  authenticateRequest,
  readBearerToken,
  requireAuthenticatedRequest,
  withAuthenticatedUser,
} from "../../backend/src/auth/auth-middleware.mjs";

const secret = "0123456789abcdef0123456789abcdef";
const now = new Date("2026-06-05T04:00:00.000Z");
const user = {
  id: "user_1",
  email: "ada@example.com",
  name: "Ada",
  avatarUrl: "https://example.com/ada.png",
};

test("JWT service issues and verifies signed user tokens", () => {
  const jwt = createJwtService({
    secret,
    issuer: "test-suite",
    audience: "test-web",
    expiresInSeconds: 3600,
    now: () => now,
  });

  const token = jwt.issueToken({ user });
  const verified = jwt.verifyToken(token);

  assert.equal(token.split(".").length, 3);
  assert.equal(verified.user.id, "user_1");
  assert.equal(verified.user.email, "ada@example.com");
  assert.equal(verified.payload.iss, "test-suite");
  assert.equal(verified.payload.aud, "test-web");
  assert.equal(verified.payload.sub, "user_1");
  assert.equal(verified.payload.exp, Math.floor(now.getTime() / 1000) + 3600);
});

test("JWT verification rejects tampered, expired, and wrong-audience tokens", () => {
  const jwt = createJwtService({
    secret,
    issuer: "test-suite",
    audience: "test-web",
    expiresInSeconds: 1,
    now: () => now,
  });

  const token = jwt.issueToken({ user });
  assert.throws(() => jwt.verifyToken(`${token.slice(0, -1)}x`), /signature is invalid/);

  const expired = createJwtService({
    secret,
    issuer: "test-suite",
    audience: "test-web",
    expiresInSeconds: 1,
    now: () => new Date("2026-06-05T03:00:00.000Z"),
  }).issueToken({ user });
  const verifierAfterExpiry = createJwtService({
    secret,
    issuer: "test-suite",
    audience: "test-web",
    now: () => now,
  });
  assert.throws(() => verifierAfterExpiry.verifyToken(expired), /expired/);

  const wrongAudience = signJwt(
    {
      iss: "test-suite",
      aud: "other-web",
      sub: "user_1",
      exp: Math.floor(now.getTime() / 1000) + 3600,
      user,
    },
    secret,
  );
  assert.throws(() => jwt.verifyToken(wrongAudience), /audience is invalid/);
});

test("JWT helpers validate secret length and required user id", () => {
  assert.throws(() => createJwtService({ secret: "too-short" }), /JWT_SECRET must be at least 32 characters/);
  assert.throws(() => normalizeJwtUser({ email: "missing@example.com" }), /user.id is required/);
});

test("low-level JWT functions sign and verify payloads", () => {
  const token = signJwt(
    {
      iss: "issuer",
      aud: "audience",
      sub: "user_1",
      exp: Math.floor(now.getTime() / 1000) + 60,
    },
    secret,
  );
  const payload = verifyJwt(token, secret);
  assert.equal(payload.sub, "user_1");
});

test("auth middleware reads Bearer tokens from common header containers", () => {
  assert.equal(readBearerToken({ headers: { authorization: "Bearer abc" } }), "abc");
  assert.equal(readBearerToken({ headers: new Headers({ authorization: "Bearer def" }) }), "def");
  assert.equal(readBearerToken({ headers: { Authorization: ["Bearer ghi"] } }), "ghi");
  assert.equal(readBearerToken({ headers: { authorization: "Basic xyz" } }), "");
});

test("auth middleware attaches verified user and claims to request", () => {
  const jwt = createJwtService({
    secret,
    issuer: "test-suite",
    audience: "test-web",
    expiresInSeconds: 3600,
    now: () => now,
  });
  const token = jwt.issueToken({ user });
  const request = authenticateRequest(
    {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    },
    { jwtService: jwt },
  );

  assert.equal(request.user.id, "user_1");
  assert.equal(request.auth.token, token);
  assert.equal(request.auth.claims.sub, "user_1");
});

test("auth middleware rejects missing or invalid tokens with ApiError", () => {
  const jwt = createJwtService({ secret });
  assert.throws(
    () => authenticateRequest({ headers: {} }, { jwtService: jwt }),
    (error) => error instanceof ApiError && error.status === 401 && error.code === "UNAUTHENTICATED",
  );
  assert.throws(
    () => authenticateRequest({ headers: { authorization: "Bearer invalid" } }, { jwtService: jwt }),
    (error) => error instanceof ApiError && error.status === 401 && error.code === "UNAUTHENTICATED",
  );
});

test("requireAuthenticatedRequest preserves already-authenticated route requests", () => {
  const request = { user: { id: "existing_user" }, headers: {} };
  assert.equal(requireAuthenticatedRequest(request, { jwtService: { verifyToken() {} } }), request);
});

test("withAuthenticatedUser wraps protected route handlers", async () => {
  const jwt = createJwtService({
    secret,
    issuer: "test-suite",
    audience: "test-web",
    expiresInSeconds: 3600,
    now: () => now,
  });
  const token = jwt.issueToken({ user });
  const handler = withAuthenticatedUser(
    async (request) => ({
      status: 200,
      body: { userId: request.user.id },
    }),
    { jwtService: jwt },
  );

  const response = await handler({ headers: { authorization: `Bearer ${token}` } });
  assert.deepEqual(response, {
    status: 200,
    body: { userId: "user_1" },
  });
});
