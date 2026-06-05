import crypto from "node:crypto";
import { ApiError, logUnhandledError, toErrorResponse } from "../../../scripts/error-response.mjs";

const GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const DEFAULT_SCOPES = ["openid", "email", "profile"];

export function createGoogleOAuthConfig({
  clientId = process.env.GOOGLE_CLIENT_ID,
  clientSecret = process.env.GOOGLE_CLIENT_SECRET,
  redirectUri = process.env.GOOGLE_REDIRECT_URI,
  publicAppUrl = process.env.PUBLIC_APP_URL,
  tokenUrl = GOOGLE_TOKEN_URL,
  userInfoUrl = GOOGLE_USERINFO_URL,
  authorizationUrl = GOOGLE_AUTHORIZATION_URL,
  scopes = DEFAULT_SCOPES,
} = {}) {
  return {
    clientId: requireConfig(clientId, "GOOGLE_CLIENT_ID"),
    clientSecret: requireConfig(clientSecret, "GOOGLE_CLIENT_SECRET"),
    redirectUri: requireAbsoluteUrl(redirectUri, "GOOGLE_REDIRECT_URI"),
    publicAppUrl: requireAbsoluteUrl(publicAppUrl, "PUBLIC_APP_URL"),
    tokenUrl: requireAbsoluteUrl(tokenUrl, "Google token URL"),
    userInfoUrl: requireAbsoluteUrl(userInfoUrl, "Google userinfo URL"),
    authorizationUrl: requireAbsoluteUrl(authorizationUrl, "Google authorization URL"),
    scopes: normalizeScopes(scopes),
  };
}

export function createGoogleOAuthService({
  config = createGoogleOAuthConfig(),
  userRepository,
  jwtService,
  fetchFn = globalThis.fetch,
  randomBytes = crypto.randomBytes,
} = {}) {
  if (!userRepository || typeof userRepository.upsertGoogleUser !== "function") {
    throw new Error("userRepository.upsertGoogleUser is required");
  }
  if (!jwtService || typeof jwtService.issueToken !== "function") {
    throw new Error("jwtService.issueToken is required");
  }
  if (typeof fetchFn !== "function") {
    throw new Error("fetch is required");
  }

  return {
    getAuthorizationRedirect({ next = "/", state = "" } = {}) {
      return {
        redirectTo: buildGoogleAuthorizationUrl({
          config,
          state: state || createOAuthState({ next, randomBytes }),
        }),
      };
    },
    async completeCallback({ code, state = "" }) {
      const normalizedCode = normalizeRequiredString(code, "code");
      const tokenSet = await exchangeGoogleCode({
        code: normalizedCode,
        config,
        fetchFn,
      });
      const profile = await fetchGoogleProfile({
        accessToken: tokenSet.accessToken,
        config,
        fetchFn,
      });
      const user = await userRepository.upsertGoogleUser(profile);
      const token = jwtService.issueToken({ user });
      return {
        token,
        user,
        redirectTo: resolveRedirectTo({ state, publicAppUrl: config.publicAppUrl }),
      };
    },
  };
}

export function createPostgresGoogleUserRepository(db) {
  if (!db || typeof db.query !== "function") {
    throw new Error("PostgreSQL query client is required");
  }

  return {
    async upsertGoogleUser(profile) {
      const user = normalizeGoogleProfile(profile);
      const result = await db.query(
        `
          INSERT INTO users (google_id, email, name, avatar_url)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (google_id)
          DO UPDATE SET
            email = EXCLUDED.email,
            name = EXCLUDED.name,
            avatar_url = EXCLUDED.avatar_url,
            updated_at = now()
          RETURNING id, google_id, email, name, avatar_url, created_at, updated_at
        `,
        [user.googleId, user.email, user.name, user.avatarUrl],
      );

      return mapUserRow(result.rows[0]);
    },
  };
}

export function createAuthHandlers({ oauthService, jwtService, logger = console }) {
  if (!oauthService) {
    throw new Error("oauthService is required");
  }
  if (!jwtService || typeof jwtService.verifyToken !== "function") {
    throw new Error("jwtService.verifyToken is required");
  }

  async function startGoogleSignIn(request) {
    const url = new URL(request.path, "http://local");
    const result = oauthService.getAuthorizationRedirect({
      next: url.searchParams.get("next") || "/",
      state: url.searchParams.get("state") || "",
    });
    return redirect(result.redirectTo);
  }

  async function completeGoogleCallback(request) {
    const body = request.body ?? {};
    const code = body.code ?? request.query?.code;
    const state = body.state ?? request.query?.state ?? "";
    const result = await oauthService.completeCallback({ code, state });
    return json(200, result);
  }

  async function getCurrentUser(request) {
    const token = readBearerToken(request);
    if (!token) {
      throw new ApiError(401, "UNAUTHENTICATED", "Authentication is required");
    }
    const verified = jwtService.verifyToken(token);
    return json(200, { user: verified.user });
  }

  return {
    startGoogleSignIn,
    completeGoogleCallback,
    getCurrentUser,
    async handle(request) {
      try {
        const match = matchAuthRoute(request.method, request.path);
        if (!match) {
          throw new ApiError(404, "NOT_FOUND", "Route not found");
        }

        const nextRequest = {
          ...request,
          params: match.params,
          query: match.query,
        };

        if (match.action === "startGoogleSignIn") {
          return await startGoogleSignIn(nextRequest);
        }
        if (match.action === "completeGoogleCallback") {
          return await completeGoogleCallback(nextRequest);
        }
        return await getCurrentUser(nextRequest);
      } catch (error) {
        if (!(error instanceof ApiError)) {
          logUnhandledError(error, request.requestId, logger);
        }
        return toErrorResponse(error, request.requestId);
      }
    },
  };
}

export function matchAuthRoute(method, path) {
  const url = new URL(path, "http://local");
  if (url.pathname.match(/^\/auth\/google\/?$/) && method === "GET") {
    return {
      action: "startGoogleSignIn",
      params: {},
      query: Object.fromEntries(url.searchParams.entries()),
    };
  }
  if (url.pathname.match(/^\/auth\/google\/callback\/?$/) && ["GET", "POST"].includes(method)) {
    return {
      action: "completeGoogleCallback",
      params: {},
      query: Object.fromEntries(url.searchParams.entries()),
    };
  }
  if (url.pathname.match(/^\/me\/?$/) && method === "GET") {
    return {
      action: "getCurrentUser",
      params: {},
      query: Object.fromEntries(url.searchParams.entries()),
    };
  }
  return null;
}

export function createOAuthState({ next = "/", randomBytes = crypto.randomBytes } = {}) {
  const nonce = randomBytes(16).toString("base64url");
  return Buffer.from(JSON.stringify({ nonce, next: normalizeRedirectPath(next) }), "utf8").toString("base64url");
}

export function resolveRedirectTo({ state = "", publicAppUrl }) {
  const fallback = "/";
  if (!state) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(Buffer.from(String(state), "base64url").toString("utf8"));
    return normalizeRedirectPath(parsed.next);
  } catch {
    const url = new URL(String(state), publicAppUrl);
    if (url.origin !== new URL(publicAppUrl).origin) {
      return fallback;
    }
    return normalizeRedirectPath(`${url.pathname}${url.search}${url.hash}`);
  }
}

export async function exchangeGoogleCode({ code, config, fetchFn }) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });
  const response = await fetchFn(config.tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const parsed = await parseJsonResponse(response);
  if (!response.ok) {
    throw new ApiError(401, "UNAUTHENTICATED", "Google token exchange failed", {
      providerStatus: response.status,
      providerError: parsed.error,
    });
  }

  const accessToken = normalizeRequiredString(parsed.access_token, "access_token");
  return {
    accessToken,
    idToken: parsed.id_token ? String(parsed.id_token) : "",
    tokenType: parsed.token_type ? String(parsed.token_type) : "",
    expiresIn: Number.isFinite(Number(parsed.expires_in)) ? Number(parsed.expires_in) : null,
  };
}

export async function fetchGoogleProfile({ accessToken, config, fetchFn }) {
  const response = await fetchFn(config.userInfoUrl, {
    method: "GET",
    headers: {
      authorization: `Bearer ${normalizeRequiredString(accessToken, "access_token")}`,
    },
  });
  const parsed = await parseJsonResponse(response);
  if (!response.ok) {
    throw new ApiError(401, "UNAUTHENTICATED", "Google profile request failed", {
      providerStatus: response.status,
      providerError: parsed.error,
    });
  }
  return normalizeGoogleProfile(parsed);
}

export function normalizeGoogleProfile(profile) {
  const googleId = normalizeRequiredString(profile?.googleId ?? profile?.sub ?? profile?.id, "google_id");
  const email = normalizeRequiredString(profile?.email, "email");
  return {
    googleId,
    email,
    name: String(profile?.name || profile?.given_name || email.split("@")[0]),
    avatarUrl: profile?.picture ? String(profile.picture) : profile?.avatarUrl ? String(profile.avatarUrl) : "",
  };
}

function buildGoogleAuthorizationUrl({ config, state }) {
  const url = new URL(config.authorizationUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

function readBearerToken(request) {
  const headers = request?.headers;
  if (!headers) {
    return "";
  }
  const authorization = typeof headers.get === "function" ? headers.get("authorization") : readObjectHeader(headers, "authorization");
  const headerValue = Array.isArray(authorization) ? authorization[0] : authorization;
  const match = String(headerValue || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function readObjectHeader(headers, name) {
  const expected = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === expected) {
      return value;
    }
  }
  return undefined;
}

function mapUserRow(row) {
  if (!row) {
    throw new ApiError(500, "INTERNAL_SERVER_ERROR", "User upsert did not return a row");
  }
  return {
    id: row.id,
    googleId: row.google_id,
    email: row.email,
    name: row.name || "",
    avatarUrl: row.avatar_url || "",
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function normalizeRedirectPath(value) {
  const candidate = String(value || "/");
  const url = new URL(candidate, "http://local");
  if (url.origin !== "http://local") {
    return "/";
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(502, "UPSTREAM_ERROR", "Google returned invalid JSON");
  }
}

function requireConfig(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new ApiError(500, "CONFIGURATION_ERROR", `${name} is required`);
  }
  return normalized;
}

function requireAbsoluteUrl(value, name) {
  const normalized = requireConfig(value, name);
  try {
    return new URL(normalized).toString();
  } catch {
    throw new ApiError(500, "CONFIGURATION_ERROR", `${name} must be an absolute URL`);
  }
}

function normalizeRequiredString(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} is required`, { field });
  }
  return normalized;
}

function normalizeScopes(scopes) {
  const normalized = Array.isArray(scopes) ? scopes.map((scope) => String(scope).trim()).filter(Boolean) : [];
  if (!normalized.includes("openid") || !normalized.includes("email") || !normalized.includes("profile")) {
    throw new ApiError(500, "CONFIGURATION_ERROR", "Google OAuth scopes must include openid, email, and profile");
  }
  return normalized;
}

function toIsoString(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(value).toISOString();
}

function json(status, body) {
  return { status, body };
}

function redirect(location) {
  return {
    status: 302,
    headers: {
      location,
    },
    body: {},
  };
}
