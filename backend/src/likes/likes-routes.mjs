import { ApiError, logUnhandledError, toErrorResponse } from "../../../scripts/error-response.mjs";

export function createLikesHandlers({ likesService, logger = console }) {
  if (!likesService) {
    throw new Error("likesService is required");
  }

  async function likePost(request) {
    const userId = requireUserId(request);
    const result = await likesService.likePost({
      postId: request.params.postId,
      userId,
    });
    return json(200, result);
  }

  async function unlikePost(request) {
    const userId = requireUserId(request);
    const result = await likesService.unlikePost({
      postId: request.params.postId,
      userId,
    });
    return json(200, result);
  }

  async function getLikeCount(request) {
    const result = await likesService.getLikeCount({
      postId: request.params.postId,
      userId: request.user?.id ?? null,
    });
    return json(200, result);
  }

  return {
    likePost,
    unlikePost,
    getLikeCount,
    async handle(request) {
      try {
        const match = matchLikesRoute(request.method, request.path);
        if (!match) {
          throw new ApiError(404, "NOT_FOUND", "Route not found");
        }

        const nextRequest = {
          ...request,
          params: match.params,
        };

        if (match.action === "likePost") {
          return await likePost(nextRequest);
        }
        if (match.action === "unlikePost") {
          return await unlikePost(nextRequest);
        }
        return await getLikeCount(nextRequest);
      } catch (error) {
        if (!(error instanceof ApiError)) {
          logUnhandledError(error, request.requestId, logger);
        }
        return toErrorResponse(error, request.requestId);
      }
    },
  };
}

export function matchLikesRoute(method, path) {
  const url = new URL(path, "http://local");
  const likeMatch = url.pathname.match(/^\/posts\/([^/]+)\/like\/?$/);
  if (likeMatch && method === "POST") {
    return {
      action: "likePost",
      params: { postId: decodeURIComponent(likeMatch[1]) },
    };
  }
  if (likeMatch && method === "DELETE") {
    return {
      action: "unlikePost",
      params: { postId: decodeURIComponent(likeMatch[1]) },
    };
  }

  const likesMatch = url.pathname.match(/^\/posts\/([^/]+)\/likes\/?$/);
  if (likesMatch && method === "GET") {
    return {
      action: "getLikeCount",
      params: { postId: decodeURIComponent(likesMatch[1]) },
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
