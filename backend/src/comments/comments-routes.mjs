import { ApiError, logUnhandledError, toErrorResponse } from "../../../scripts/error-response.mjs";

export function createCommentsHandlers({ commentsService, logger = console }) {
  if (!commentsService) {
    throw new Error("commentsService is required");
  }

  async function listComments(request) {
    const result = await commentsService.listComments({
      postId: request.params.postId,
      limit: request.query?.limit,
      cursor: request.query?.cursor ?? null,
    });
    return json(200, result);
  }

  async function createComment(request) {
    const userId = requireUserId(request);
    const result = await commentsService.createComment({
      postId: request.params.postId,
      authorId: userId,
      content: request.body?.content,
    });
    return json(201, { comment: result });
  }

  async function deleteComment(request) {
    const userId = requireUserId(request);
    await commentsService.deleteComment({
      commentId: request.params.commentId,
      requesterId: userId,
    });
    return { status: 204, body: null };
  }

  return {
    listComments,
    createComment,
    deleteComment,
    async handle(request) {
      try {
        const match = matchCommentsRoute(request.method, request.path);
        if (!match) {
          throw new ApiError(404, "NOT_FOUND", "Route not found");
        }

        const nextRequest = {
          ...request,
          params: match.params,
          query: request.query ?? Object.fromEntries(new URL(request.path, "http://local").searchParams),
        };

        if (match.action === "listComments") {
          return await listComments(nextRequest);
        }
        if (match.action === "createComment") {
          return await createComment(nextRequest);
        }
        return await deleteComment(nextRequest);
      } catch (error) {
        if (!(error instanceof ApiError)) {
          logUnhandledError(error, request.requestId, logger);
        }
        return toErrorResponse(error, request.requestId);
      }
    },
  };
}

export function matchCommentsRoute(method, path) {
  const url = new URL(path, "http://local");
  const postCommentsMatch = url.pathname.match(/^\/posts\/([^/]+)\/comments\/?$/);
  if (postCommentsMatch && method === "GET") {
    return {
      action: "listComments",
      params: { postId: decodeURIComponent(postCommentsMatch[1]) },
    };
  }
  if (postCommentsMatch && method === "POST") {
    return {
      action: "createComment",
      params: { postId: decodeURIComponent(postCommentsMatch[1]) },
    };
  }

  const commentMatch = url.pathname.match(/^\/comments\/([^/]+)\/?$/);
  if (commentMatch && method === "DELETE") {
    return {
      action: "deleteComment",
      params: { commentId: decodeURIComponent(commentMatch[1]) },
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
