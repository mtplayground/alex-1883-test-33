import { ApiError, logUnhandledError, toErrorResponse } from "../../../scripts/error-response.mjs";

export function createUploadsHandlers({ uploadsService, logger = console }) {
  if (!uploadsService) {
    throw new Error("uploadsService is required");
  }

  async function uploadImage(request) {
    requireUserId(request);
    const result = await uploadsService.uploadImage(readImageInput(request));
    return json(201, result);
  }

  return {
    uploadImage,
    async handle(request) {
      try {
        const match = matchUploadsRoute(request.method, request.path);
        if (!match) {
          throw new ApiError(404, "NOT_FOUND", "Route not found");
        }

        return await uploadImage({
          ...request,
          params: match.params,
        });
      } catch (error) {
        if (!(error instanceof ApiError)) {
          logUnhandledError(error, request.requestId, logger);
        }
        return toErrorResponse(error, request.requestId);
      }
    },
  };
}

export function matchUploadsRoute(method, path) {
  const url = new URL(path, "http://local");
  if (url.pathname.match(/^\/uploads\/images\/?$/) && method === "POST") {
    return {
      action: "uploadImage",
      params: {},
    };
  }
  return null;
}

function readImageInput(request) {
  return request.file ?? request.body?.file ?? request.body?.image ?? request.body ?? {};
}

function requireUserId(request) {
  const userId = request.user?.id;
  if (!userId) {
    throw new ApiError(401, "UNAUTHENTICATED", "Authentication is required");
  }
  return userId;
}

function json(status, body) {
  return { status, body };
}
