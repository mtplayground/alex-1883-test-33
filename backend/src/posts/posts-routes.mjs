import { ApiError, logUnhandledError, toErrorResponse } from "../../../scripts/error-response.mjs";

export function createPostsHandlers({ postsService, logger = console }) {
  if (!postsService) {
    throw new Error("postsService is required");
  }

  async function createPost(request) {
    const userId = requireUserId(request);
    const result = await postsService.createPost({
      authorId: userId,
      imageUrl: request.body?.imageUrl ?? request.body?.url,
      caption: request.body?.caption ?? request.body?.description ?? "",
    });
    return json(201, { post: result });
  }

  async function getPostDetail(request) {
    const result = await postsService.getPostDetail({
      postId: request.params.postId,
      viewerId: request.user?.id ?? null,
    });
    return json(200, result);
  }

  return {
    createPost,
    getPostDetail,
    async handle(request) {
      try {
        const match = matchPostsRoute(request.method, request.path);
        if (!match) {
          throw new ApiError(404, "NOT_FOUND", "Route not found");
        }

        const nextRequest = {
          ...request,
          params: match.params,
        };

        if (match.action === "createPost") {
          return await createPost(nextRequest);
        }
        return await getPostDetail(nextRequest);
      } catch (error) {
        if (!(error instanceof ApiError)) {
          logUnhandledError(error, request.requestId, logger);
        }
        return toErrorResponse(error, request.requestId);
      }
    },
  };
}

export function matchPostsRoute(method, path) {
  const url = new URL(path, "http://local");
  if (url.pathname.match(/^\/posts\/?$/) && method === "POST") {
    return {
      action: "createPost",
      params: {},
    };
  }
  const detailMatch = url.pathname.match(/^\/posts\/([^/]+)\/?$/);
  if (detailMatch && method === "GET") {
    return {
      action: "getPostDetail",
      params: { postId: decodeURIComponent(detailMatch[1]) },
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
