import { ApiError, logUnhandledError, toErrorResponse } from "../../../scripts/error-response.mjs";

export function createFeedHandlers({ feedService, logger = console }) {
  if (!feedService) {
    throw new Error("feedService is required");
  }

  async function listFeed(request) {
    const userId = requireUserId(request);
    const result = await feedService.listFeed({
      userId,
      limit: request.query?.limit,
      cursor: request.query?.cursor ?? null,
    });
    return json(200, result);
  }

  return {
    listFeed,
    async handle(request) {
      try {
        const match = matchFeedRoute(request.method, request.path);
        if (!match) {
          throw new ApiError(404, "NOT_FOUND", "Route not found");
        }

        const nextRequest = {
          ...request,
          params: match.params,
          query: request.query ?? Object.fromEntries(new URL(request.path, "http://local").searchParams),
        };

        return await listFeed(nextRequest);
      } catch (error) {
        if (!(error instanceof ApiError)) {
          logUnhandledError(error, request.requestId, logger);
        }
        return toErrorResponse(error, request.requestId);
      }
    },
  };
}

export function matchFeedRoute(method, path) {
  const url = new URL(path, "http://local");
  if (url.pathname.match(/^\/feed\/?$/) && method === "GET") {
    return {
      action: "listFeed",
      params: {},
    };
  }
  return null;
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
