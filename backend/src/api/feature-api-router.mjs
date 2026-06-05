import express from "express";
import multer from "multer";
import pg from "pg";

import { ApiError } from "../../../scripts/error-response.mjs";
import { authenticateRequest, readBearerToken } from "../auth/auth-middleware.mjs";
import {
  createAuthHandlers,
  createGoogleOAuthService,
  createPostgresGoogleUserRepository,
  matchAuthRoute,
} from "../auth/google-oauth.mjs";
import { createJwtService } from "../auth/jwt-service.mjs";
import { readPrismaDatabaseUrl } from "../db/prisma-client.mjs";
import { createCommentsHandlers, matchCommentsRoute } from "../comments/comments-routes.mjs";
import { createCommentsService, createPostgresCommentsRepository } from "../comments/comments-service.mjs";
import { createFeedHandlers, matchFeedRoute } from "../feed/feed-routes.mjs";
import { createFeedService, createPostgresFeedRepository } from "../feed/feed-service.mjs";
import { createFollowsHandlers, matchFollowsRoute } from "../follows/follows-routes.mjs";
import { createFollowsService, createPostgresFollowsRepository } from "../follows/follows-service.mjs";
import { createLikesHandlers, matchLikesRoute } from "../likes/likes-routes.mjs";
import { createLikesService, createPostgresLikesRepository } from "../likes/likes-service.mjs";
import { createPostsHandlers, matchPostsRoute } from "../posts/posts-routes.mjs";
import { createPostgresPostsRepository, createPostsService } from "../posts/posts-service.mjs";
import { createUploadsHandlers, matchUploadsRoute } from "../uploads/uploads-routes.mjs";
import { createS3ImageStorage, createUploadsService } from "../uploads/uploads-service.mjs";

const { Pool } = pg;

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   logger?: Console,
 *   db?: { query: Function },
 *   jwtService?: { verifyToken: Function, issueToken?: Function },
 *   storage?: { putImage: Function },
 *   fetchFn?: typeof fetch,
 * }} options
 * @returns {import("express").Router}
 */
export function createFeatureApiRouter({ env = process.env, logger = console, db, jwtService, storage, fetchFn } = {}) {
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
  });
  const registry = createHandlerRegistry({ env, logger, db, jwtService, storage, fetchFn });

  router.post("/uploads/images", upload.single("image"), handleRequest);
  router.use(handleRequest);

  return router;

  /**
   * @param {import("express").Request} request
   * @param {import("express").Response} response
   * @param {import("express").NextFunction} next
   */
  async function handleRequest(request, response, next) {
    try {
      const apiRequest = maybeAuthenticate(toApiRequest(request, response), registry.getJwtService);
      const handler = registry.resolve(apiRequest.method, apiRequest.path);
      if (!handler) {
        throw new ApiError(
          404,
          "NOT_FOUND",
          `Route ${apiRequest.method} ${new URL(apiRequest.path, "http://local").pathname} was not found`,
        );
      }

      sendHandlerResponse(response, await handler.handle(apiRequest));
    } catch (error) {
      next(error);
    }
  }
}

function createHandlerRegistry({ env, logger, db, jwtService, storage, fetchFn }) {
  let pool = db;
  let resolvedJwtService = jwtService;
  let authHandlers;
  let uploadsHandlers;
  let postsHandlers;
  let feedHandlers;
  let followsHandlers;
  let likesHandlers;
  let commentsHandlers;

  function getDb() {
    if (!pool) {
      const databaseUrl = readPrismaDatabaseUrl(env);
      pool = new Pool({
        connectionString: toPgConnectionString(databaseUrl),
        ssl: shouldUseSsl(databaseUrl) ? { rejectUnauthorized: false } : undefined,
      });
    }
    return pool;
  }

  function getJwtService() {
    if (!resolvedJwtService) {
      const options = {
        secret: env.JWT_SECRET,
        issuer: env.JWT_ISSUER || undefined,
        audience: env.JWT_AUDIENCE || undefined,
      };
      if (env.JWT_EXPIRES_IN_SECONDS) {
        options.expiresInSeconds = Number(env.JWT_EXPIRES_IN_SECONDS);
      }
      resolvedJwtService = createJwtService(options);
    }
    return resolvedJwtService;
  }

  return {
    getJwtService,
    resolve(method, path) {
      if (matchAuthRoute(method, path)) {
        authHandlers ??= createAuthHandlers({
          oauthService: createGoogleOAuthService({
            userRepository: createPostgresGoogleUserRepository(getDb()),
            jwtService: getJwtService(),
            fetchFn,
          }),
          jwtService: getJwtService(),
          logger,
        });
        return authHandlers;
      }

      if (matchUploadsRoute(method, path)) {
        uploadsHandlers ??= createUploadsHandlers({
          uploadsService: createUploadsService({
            storage: storage ?? createConfiguredImageStorage({ env }),
          }),
          logger,
        });
        return uploadsHandlers;
      }

      if (matchPostsRoute(method, path)) {
        postsHandlers ??= createPostsHandlers({
          postsService: createPostsService({
            repository: createPostgresPostsRepository(getDb()),
          }),
          logger,
        });
        return postsHandlers;
      }

      if (matchFeedRoute(method, path)) {
        feedHandlers ??= createFeedHandlers({
          feedService: createFeedService({
            repository: createPostgresFeedRepository(getDb()),
          }),
          logger,
        });
        return feedHandlers;
      }

      if (matchFollowsRoute(method, path)) {
        followsHandlers ??= createFollowsHandlers({
          followsService: createFollowsService({
            repository: createPostgresFollowsRepository(getDb()),
          }),
          logger,
        });
        return followsHandlers;
      }

      if (matchLikesRoute(method, path)) {
        likesHandlers ??= createLikesHandlers({
          likesService: createLikesService({
            repository: createPostgresLikesRepository(getDb()),
          }),
          logger,
        });
        return likesHandlers;
      }

      if (matchCommentsRoute(method, path)) {
        commentsHandlers ??= createCommentsHandlers({
          commentsService: createCommentsService({
            repository: createPostgresCommentsRepository(getDb()),
          }),
          logger,
        });
        return commentsHandlers;
      }

      return null;
    },
  };
}

function toApiRequest(request, response) {
  const file = request.file
    ? {
        buffer: request.file.buffer,
        contentType: request.file.mimetype,
        originalName: request.file.originalname,
        size: request.file.size,
      }
    : undefined;

  return {
    method: request.method,
    path: getMountedPath(request),
    headers: request.headers,
    body: request.body,
    query: request.query,
    requestId: response.locals.requestId,
    file,
  };
}

function maybeAuthenticate(request, getJwtService) {
  if (!readBearerToken(request)) {
    return request;
  }
  return authenticateRequest(request, { jwtService: getJwtService() });
}

function sendHandlerResponse(response, result) {
  const status = result?.status ?? 200;
  for (const [name, value] of Object.entries(result?.headers ?? {})) {
    response.set(name, value);
  }

  if (status === 204 || result?.body === undefined || result?.body === null) {
    response.status(status).end();
    return;
  }

  response.status(status).json(result.body);
}

function getMountedPath(request) {
  const baseUrl = request.baseUrl || "";
  const originalUrl = request.originalUrl || request.url || "/";
  if (baseUrl && originalUrl.startsWith(baseUrl)) {
    const mountedPath = originalUrl.slice(baseUrl.length);
    return mountedPath || "/";
  }
  return request.url || "/";
}

function shouldUseSsl(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const sslMode = parsed.searchParams.get("sslmode");
  return sslMode === "require" || !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
}

function toPgConnectionString(databaseUrl) {
  const parsed = new URL(databaseUrl);
  parsed.searchParams.delete("sslmode");
  return parsed.toString();
}

function createConfiguredImageStorage({ env }) {
  if (!hasObjectStorageConfig(env)) {
    return {
      async putImage() {
        throw new ApiError(503, "FEATURE_UNAVAILABLE", "Image uploads are not configured");
      },
    };
  }
  return createS3ImageStorage({ env });
}

function hasObjectStorageConfig(env) {
  return [
    "OBJECT_STORAGE_ENDPOINT",
    "OBJECT_STORAGE_REGION",
    "OBJECT_STORAGE_BUCKET",
    "OBJECT_STORAGE_ACCESS_KEY_ID",
    "OBJECT_STORAGE_SECRET_ACCESS_KEY",
    "OBJECT_STORAGE_PREFIX",
  ].every((name) => Boolean(env[name] && String(env[name]).trim()));
}
