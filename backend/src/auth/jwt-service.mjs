import crypto from "node:crypto";
import { ApiError } from "../../../scripts/error-response.mjs";

const JWT_ALGORITHM = "HS256";
const DEFAULT_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7;

export function createJwtService({
  secret = process.env.JWT_SECRET,
  issuer = "alex-1883-test-33",
  audience = "alex-1883-test-33:web",
  expiresInSeconds = DEFAULT_EXPIRES_IN_SECONDS,
  now = () => new Date(),
} = {}) {
  const normalizedSecret = requireJwtSecret(secret);

  return {
    issueToken({ user, extraClaims = {} }) {
      const normalizedUser = normalizeJwtUser(user);
      const issuedAt = unixSeconds(now());
      const expiresAt = issuedAt + normalizeExpiresIn(expiresInSeconds);
      const payload = {
        ...extraClaims,
        iss: issuer,
        aud: audience,
        sub: String(normalizedUser.id),
        iat: issuedAt,
        exp: expiresAt,
        user: normalizedUser,
      };
      return signJwt(payload, normalizedSecret);
    },
    verifyToken(token) {
      const payload = verifyJwt(token, normalizedSecret);
      validateRegisteredClaims(payload, { issuer, audience, now });
      const user = normalizeJwtUser(payload.user ?? { id: payload.sub });
      if (String(user.id) !== String(payload.sub)) {
        throw unauthenticated("JWT subject does not match user");
      }
      return {
        payload,
        user,
      };
    },
  };
}

export function signJwt(payload, secret) {
  const header = {
    alg: JWT_ALGORITHM,
    typ: "JWT",
  };
  const encodedHeader = base64UrlEncodeJson(header);
  const encodedPayload = base64UrlEncodeJson(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = hmacSha256(signingInput, requireJwtSecret(secret));
  return `${signingInput}.${signature}`;
}

export function verifyJwt(token, secret) {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw unauthenticated("JWT must have three parts");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = parseBase64UrlJson(encodedHeader, "JWT header");
  if (header.alg !== JWT_ALGORITHM || header.typ !== "JWT") {
    throw unauthenticated("JWT algorithm is not supported");
  }

  const expectedSignature = hmacSha256(`${encodedHeader}.${encodedPayload}`, requireJwtSecret(secret));
  if (!timingSafeEqualBase64Url(encodedSignature, expectedSignature)) {
    throw unauthenticated("JWT signature is invalid");
  }

  return parseBase64UrlJson(encodedPayload, "JWT payload");
}

export function normalizeJwtUser(user) {
  if (!user || user.id === undefined || user.id === null || String(user.id).trim() === "") {
    throw new ApiError(400, "VALIDATION_ERROR", "user.id is required", { field: "user.id" });
  }
  return {
    id: user.id,
    email: user.email ? String(user.email) : "",
    name: user.name ? String(user.name) : "",
    avatarUrl: user.avatarUrl ? String(user.avatarUrl) : "",
  };
}

function validateRegisteredClaims(payload, { issuer, audience, now }) {
  if (payload.iss !== issuer) {
    throw unauthenticated("JWT issuer is invalid");
  }
  if (payload.aud !== audience) {
    throw unauthenticated("JWT audience is invalid");
  }
  if (!payload.sub) {
    throw unauthenticated("JWT subject is required");
  }
  if (!Number.isInteger(payload.exp)) {
    throw unauthenticated("JWT expiration is required");
  }
  if (payload.exp <= unixSeconds(now())) {
    throw unauthenticated("JWT is expired");
  }
}

function normalizeExpiresIn(value) {
  const seconds = Number(value);
  if (!Number.isInteger(seconds) || seconds <= 0) {
    throw new ApiError(500, "CONFIGURATION_ERROR", "JWT expiration must be a positive integer");
  }
  return seconds;
}

function requireJwtSecret(secret) {
  const value = String(secret ?? "");
  if (value.length < 32) {
    throw new ApiError(500, "CONFIGURATION_ERROR", "JWT_SECRET must be at least 32 characters");
  }
  return value;
}

function base64UrlEncodeJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function parseBase64UrlJson(value, label) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw unauthenticated(`${label} is invalid`);
  }
}

function hmacSha256(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function timingSafeEqualBase64Url(left, right) {
  const leftBuffer = Buffer.from(String(left), "base64url");
  const rightBuffer = Buffer.from(String(right), "base64url");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function unixSeconds(value) {
  return Math.floor(new Date(value).getTime() / 1000);
}

function unauthenticated(message) {
  return new ApiError(401, "UNAUTHENTICATED", message);
}
