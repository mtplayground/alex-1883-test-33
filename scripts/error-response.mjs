export class ApiError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function toErrorResponse(error, requestId = undefined) {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          requestId,
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
        requestId,
      },
    },
  };
}

export function logUnhandledError(error, requestId = undefined, logger = console) {
  const normalized = normalizeErrorForLog(error);
  logger.error("Unhandled application error", {
    requestId,
    name: normalized.name,
    code: normalized.code,
    message: normalized.message,
    stack: normalized.stack,
  });
}

function normalizeErrorForLog(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      code: error.code,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: "NonErrorThrown",
    code: undefined,
    message: String(error),
    stack: undefined,
  };
}
