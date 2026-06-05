import { ApiError, logUnhandledError, toErrorResponse } from "../../../scripts/error-response.mjs";

export function createFollowsHandlers({ followsService, logger = console }) {
  if (!followsService) {
    throw new Error("followsService is required");
  }

  async function followUser(request) {
    const userId = requireUserId(request);
    const result = await followsService.followUser({
      followerId: userId,
      followeeId: request.params.userId,
    });
    return json(200, result);
  }

  async function unfollowUser(request) {
    const userId = requireUserId(request);
    const result = await followsService.unfollowUser({
      followerId: userId,
      followeeId: request.params.userId,
    });
    return json(200, result);
  }

  async function getFollowCounts(request) {
    const result = await followsService.getFollowCounts({
      targetUserId: request.params.userId,
      viewerId: request.user?.id ?? null,
    });
    return json(200, result);
  }

  return {
    followUser,
    unfollowUser,
    getFollowCounts,
    async handle(request) {
      try {
        const match = matchFollowsRoute(request.method, request.path);
        if (!match) {
          throw new ApiError(404, "NOT_FOUND", "Route not found");
        }

        const nextRequest = {
          ...request,
          params: match.params,
        };

        if (match.action === "followUser") {
          return await followUser(nextRequest);
        }
        if (match.action === "unfollowUser") {
          return await unfollowUser(nextRequest);
        }
        return await getFollowCounts(nextRequest);
      } catch (error) {
        if (!(error instanceof ApiError)) {
          logUnhandledError(error, request.requestId, logger);
        }
        return toErrorResponse(error, request.requestId);
      }
    },
  };
}

export function matchFollowsRoute(method, path) {
  const url = new URL(path, "http://local");
  const followMatch = url.pathname.match(/^\/users\/([^/]+)\/follow\/?$/);
  if (followMatch && method === "POST") {
    return {
      action: "followUser",
      params: { userId: decodeURIComponent(followMatch[1]) },
    };
  }
  if (followMatch && method === "DELETE") {
    return {
      action: "unfollowUser",
      params: { userId: decodeURIComponent(followMatch[1]) },
    };
  }

  const countsMatch = url.pathname.match(/^\/users\/([^/]+)\/follow-counts\/?$/);
  if (countsMatch && method === "GET") {
    return {
      action: "getFollowCounts",
      params: { userId: decodeURIComponent(countsMatch[1]) },
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
