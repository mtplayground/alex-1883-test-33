import crypto from "node:crypto";

import express from "express";

import { ApiError, logUnhandledError, toErrorResponse } from "../../scripts/error-response.mjs";

/**
 * @param {{ logger?: Console }} options
 */
export function createExpressApp({ logger = console } = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.use(assignRequestId);
  app.use(express.json({ limit: "1mb" }));

  app.get("/healthz", healthCheckHandler);
  app.get("/api/healthz", healthCheckHandler);

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
}

/**
 * @param {import("express").Request} request
 * @param {import("express").Response} response
 * @param {import("express").NextFunction} next
 */
function assignRequestId(request, response, next) {
  const requestId = request.get("x-request-id") || crypto.randomUUID();
  response.locals.requestId = requestId;
  response.set("x-request-id", requestId);
  next();
}

/**
 * @param {import("express").Request} _request
 * @param {import("express").Response} response
 */
function healthCheckHandler(_request, response) {
  response.status(200).json({
    status: "ok",
    service: "alex-1883-test-33-backend",
  });
}

/**
 * @param {import("express").Request} request
 * @param {import("express").Response} _response
 * @param {import("express").NextFunction} next
 */
function notFoundHandler(request, _response, next) {
  next(new ApiError(404, "NOT_FOUND", `Route ${request.method} ${request.path} was not found`));
}

/**
 * @param {Console} logger
 * @returns {import("express").ErrorRequestHandler}
 */
function errorHandler(logger) {
  return (error, _request, response, _next) => {
    const requestId = response.locals.requestId;

    if (!(error instanceof ApiError)) {
      logUnhandledError(error, requestId, logger);
    }

    const errorResponse = toErrorResponse(error, requestId);
    response.status(errorResponse.status).json(errorResponse.body);
  };
}
