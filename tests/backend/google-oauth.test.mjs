import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../../scripts/error-response.mjs";
import { createJwtService } from "../../backend/src/auth/jwt-service.mjs";
import {
  createAuthHandlers,
  createGoogleOAuthConfig,
  createGoogleOAuthService,
  createOAuthState,
  createPostgresGoogleUserRepository,
  exchangeGoogleCode,
  fetchGoogleProfile,
  matchAuthRoute,
  normalizeGoogleProfile,
  resolveRedirectTo,
} from "../../backend/src/auth/google-oauth.mjs";

const config = createGoogleOAuthConfig({
  clientId: "google-client-id",
  clientSecret: "google-client-secret",
  redirectUri: "https://app.example.com/auth/callback",
  publicAppUrl: "https://app.example.com",
  tokenUrl: "https://google.example.test/token",
  userInfoUrl: "https://google.example.test/userinfo",
  authorizationUrl: "https://google.example.test/auth",
});
const jwtSecret = "0123456789abcdef0123456789abcdef";
const now = new Date("2026-06-05T04:00:00.000Z");
const storedUser = {
  id: "user_1",
  googleId: "google_123",
  email: "ada@example.com",
  name: "Ada Lovelace",
  avatarUrl: "https://example.com/ada.png",
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};

test("matchAuthRoute maps Google OAuth and current-user routes", () => {
  assert.deepEqual(matchAuthRoute("GET", "/auth/google?next=%2Ffeed"), {
    action: "startGoogleSignIn",
    params: {},
    query: { next: "/feed" },
  });
  assert.deepEqual(matchAuthRoute("POST", "/auth/google/callback"), {
    action: "completeGoogleCallback",
    params: {},
    query: {},
  });
  assert.deepEqual(matchAuthRoute("GET", "/auth/google/callback?code=abc&state=nonce"), {
    action: "completeGoogleCallback",
    params: {},
    query: { code: "abc", state: "nonce" },
  });
  assert.deepEqual(matchAuthRoute("GET", "/me"), {
    action: "getCurrentUser",
    params: {},
    query: {},
  });
  assert.equal(matchAuthRoute("POST", "/auth/google"), null);
});

test("Google OAuth start builds an authorization redirect with required parameters", () => {
  const service = createGoogleOAuthService({
    config,
    userRepository: userRepositoryStub(),
    jwtService: jwtServiceStub(),
    randomBytes: () => Buffer.alloc(16, 1),
  });

  const result = service.getAuthorizationRedirect({ next: "/feed?tab=home" });
  const redirect = new URL(result.redirectTo);

  assert.equal(redirect.origin + redirect.pathname, "https://google.example.test/auth");
  assert.equal(redirect.searchParams.get("client_id"), "google-client-id");
  assert.equal(redirect.searchParams.get("redirect_uri"), "https://app.example.com/auth/callback");
  assert.equal(redirect.searchParams.get("response_type"), "code");
  assert.equal(redirect.searchParams.get("scope"), "openid email profile");
  assert.equal(redirect.searchParams.get("access_type"), "offline");
  assert.equal(resolveRedirectTo({ state: redirect.searchParams.get("state"), publicAppUrl: config.publicAppUrl }), "/feed?tab=home");
});

test("OAuth callback exchanges Google code, upserts the user, and returns a JWT", async () => {
  const fetchCalls = [];
  const upsertedProfiles = [];
  const jwt = createJwtService({
    secret: jwtSecret,
    issuer: "test-suite",
    audience: "test-web",
    now: () => now,
  });
  const service = createGoogleOAuthService({
    config,
    userRepository: {
      async upsertGoogleUser(profile) {
        upsertedProfiles.push(profile);
        return storedUser;
      },
    },
    jwtService: jwt,
    fetchFn: async (url, init) => {
      fetchCalls.push({ url: String(url), init });
      if (String(url).endsWith("/token")) {
        return jsonResponse(200, { access_token: "google-access-token", expires_in: 3600 });
      }
      return jsonResponse(200, {
        sub: "google_123",
        email: "ada@example.com",
        name: "Ada Lovelace",
        picture: "https://example.com/ada.png",
      });
    },
  });
  const state = createOAuthState({
    next: "/profile",
    randomBytes: () => Buffer.alloc(16, 2),
  });

  const result = await service.completeCallback({ code: "google-code", state });
  const verified = jwt.verifyToken(result.token);

  assert.equal(result.redirectTo, "/profile");
  assert.equal(result.user.email, "ada@example.com");
  assert.equal(verified.user.id, "user_1");
  assert.deepEqual(upsertedProfiles, [
    {
      googleId: "google_123",
      email: "ada@example.com",
      name: "Ada Lovelace",
      avatarUrl: "https://example.com/ada.png",
    },
  ]);
  assert.equal(fetchCalls[0].url, "https://google.example.test/token");
  assert.equal(fetchCalls[0].init.method, "POST");
  assert.equal(fetchCalls[0].init.body.get("code"), "google-code");
  assert.equal(fetchCalls[0].init.body.get("grant_type"), "authorization_code");
  assert.equal(fetchCalls[1].url, "https://google.example.test/userinfo");
  assert.equal(fetchCalls[1].init.headers.authorization, "Bearer google-access-token");
});

test("Google token and profile helpers map provider failures into ApiError envelopes", async () => {
  await assert.rejects(
    exchangeGoogleCode({
      code: "bad-code",
      config,
      fetchFn: async () => jsonResponse(400, { error: "invalid_grant" }),
    }),
    (error) =>
      error instanceof ApiError &&
      error.status === 401 &&
      error.code === "UNAUTHENTICATED" &&
      error.details.providerError === "invalid_grant",
  );

  await assert.rejects(
    fetchGoogleProfile({
      accessToken: "bad-token",
      config,
      fetchFn: async () => jsonResponse(401, { error: "invalid_token" }),
    }),
    /Google profile request failed/,
  );

  await assert.rejects(
    exchangeGoogleCode({
      code: "bad-json",
      config,
      fetchFn: async () => textResponse(200, "{not-json"),
    }),
    /Google returned invalid JSON/,
  );
});

test("PostgreSQL Google user repository upserts by google_id with parameterized queries", async () => {
  const queries = [];
  const repository = createPostgresGoogleUserRepository({
    async query(text, params) {
      queries.push({ text, params });
      return {
        rows: [
          {
            id: "user_1",
            google_id: "google_123",
            email: "ada@example.com",
            name: "Ada Lovelace",
            avatar_url: "https://example.com/ada.png",
            created_at: now,
            updated_at: now,
          },
        ],
      };
    },
  });

  const user = await repository.upsertGoogleUser({
    googleId: "google_123",
    email: "ada@example.com",
    name: "Ada Lovelace",
    avatarUrl: "https://example.com/ada.png",
  });

  assert.equal(user.id, "user_1");
  assert.equal(user.googleId, "google_123");
  assert.equal(user.createdAt, now.toISOString());
  assert.deepEqual(queries[0].params, ["google_123", "ada@example.com", "Ada Lovelace", "https://example.com/ada.png"]);
  assert.match(queries[0].text, /INSERT INTO users \(google_id, email, name, avatar_url\)/);
  assert.match(queries[0].text, /ON CONFLICT \(google_id\)/);
  assert.match(queries[0].text, /RETURNING id, google_id, email, name, avatar_url, created_at, updated_at/);
});

test("auth handlers return redirects, callback tokens, current user, and error envelopes", async () => {
  const jwt = createJwtService({
    secret: jwtSecret,
    issuer: "test-suite",
    audience: "test-web",
    now: () => now,
  });
  const handlers = createAuthHandlers({
    oauthService: {
      getAuthorizationRedirect({ next }) {
        return { redirectTo: `https://google.example.test/auth?next=${encodeURIComponent(next)}` };
      },
      async completeCallback({ code, state }) {
        assert.equal(code, "google-code");
        assert.equal(state, "state-1");
        return {
          token: jwt.issueToken({ user: storedUser }),
          user: storedUser,
          redirectTo: "/profile",
        };
      },
    },
    jwtService: jwt,
  });

  const redirect = await handlers.handle({
    method: "GET",
    path: "/auth/google?next=%2Ffeed",
    requestId: "req_1",
  });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.location, "https://google.example.test/auth?next=%2Ffeed");

  const callback = await handlers.handle({
    method: "POST",
    path: "/auth/google/callback",
    body: { code: "google-code", state: "state-1" },
    requestId: "req_2",
  });
  assert.equal(callback.status, 200);
  assert.equal(callback.body.user.id, "user_1");
  assert.equal(jwt.verifyToken(callback.body.token).user.id, "user_1");

  const me = await handlers.handle({
    method: "GET",
    path: "/me",
    headers: { authorization: `Bearer ${callback.body.token}` },
    requestId: "req_3",
  });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, "ada@example.com");

  const unauthenticated = await handlers.handle({
    method: "GET",
    path: "/me",
    requestId: "req_4",
  });
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.body.error.code, "UNAUTHENTICATED");
});

test("auth handlers log unexpected callback errors before returning generic 500", async () => {
  const logs = [];
  const handlers = createAuthHandlers({
    oauthService: {
      getAuthorizationRedirect() {
        return { redirectTo: "https://google.example.test/auth" };
      },
      async completeCallback() {
        throw Object.assign(new Error("database unavailable"), { code: "ECONNREFUSED" });
      },
    },
    jwtService: jwtServiceStub(),
    logger: {
      error(message, metadata) {
        logs.push({ message, metadata });
      },
    },
  });

  const response = await handlers.handle({
    method: "POST",
    path: "/auth/google/callback",
    body: { code: "google-code" },
    requestId: "req_5",
  });

  assert.equal(response.status, 500);
  assert.equal(response.body.error.code, "INTERNAL_SERVER_ERROR");
  assert.equal(logs[0].message, "Unhandled application error");
  assert.equal(logs[0].metadata.name, "Error");
  assert.equal(logs[0].metadata.code, "ECONNREFUSED");
  assert.match(logs[0].metadata.stack, /database unavailable/);
});

test("Google profile and redirect normalization reject unsafe or incomplete inputs", () => {
  assert.deepEqual(normalizeGoogleProfile({ sub: "g1", email: "ada@example.com" }), {
    googleId: "g1",
    email: "ada@example.com",
    name: "ada",
    avatarUrl: "",
  });
  assert.throws(() => normalizeGoogleProfile({ email: "missing@example.com" }), /google_id is required/);
  assert.equal(resolveRedirectTo({ state: "https://evil.example/phish", publicAppUrl: config.publicAppUrl }), "/");
  assert.equal(resolveRedirectTo({ state: "", publicAppUrl: config.publicAppUrl }), "/");
  assert.throws(() => createGoogleOAuthConfig({ ...config, clientId: "" }), /GOOGLE_CLIENT_ID is required/);
});

function userRepositoryStub() {
  return {
    async upsertGoogleUser() {
      return storedUser;
    },
  };
}

function jwtServiceStub() {
  return {
    issueToken() {
      return "jwt-token";
    },
    verifyToken() {
      return { user: storedUser, payload: { sub: storedUser.id } };
    },
  };
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

function textResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return body;
    },
  };
}
