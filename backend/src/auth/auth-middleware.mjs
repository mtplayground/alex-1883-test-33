import { ApiError } from "../../../scripts/error-response.mjs";

export function readBearerToken(request) {
  const authorization = readHeader(request, "authorization");
  if (!authorization) {
    return "";
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

export function authenticateRequest(request, { jwtService }) {
  if (!jwtService || typeof jwtService.verifyToken !== "function") {
    throw new Error("jwtService.verifyToken is required");
  }

  const token = readBearerToken(request);
  if (!token) {
    throw unauthenticated("Authentication is required");
  }

  const verified = jwtService.verifyToken(token);
  return {
    ...request,
    auth: {
      token,
      claims: verified.payload,
    },
    user: verified.user,
  };
}

export function requireAuthenticatedRequest(request, options) {
  if (request.user?.id) {
    return request;
  }
  return authenticateRequest(request, options);
}

export function withAuthenticatedUser(handler, { jwtService }) {
  if (typeof handler !== "function") {
    throw new Error("handler is required");
  }

  return async function authenticatedHandler(request) {
    const authenticatedRequest = requireAuthenticatedRequest(request, { jwtService });
    return handler(authenticatedRequest);
  };
}

function readHeader(request, name) {
  const headers = request?.headers;
  if (!headers) {
    return "";
  }
  if (typeof headers.get === "function") {
    return headers.get(name) || "";
  }

  const direct = readObjectHeader(headers, name);
  if (Array.isArray(direct)) {
    return direct[0] || "";
  }
  return direct ? String(direct) : "";
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

function unauthenticated(message) {
  return new ApiError(401, "UNAUTHENTICATED", message);
}
