import { ApiError } from "../../../scripts/error-response.mjs";

export const MAX_COMMENT_CONTENT_LENGTH = 1000;
export const DEFAULT_COMMENT_LIMIT = 50;
export const MAX_COMMENT_LIMIT = 100;

export function createCommentsService({ repository }) {
  if (!repository) {
    throw new Error("comments repository is required");
  }

  return {
    async listComments({ postId, limit = DEFAULT_COMMENT_LIMIT, cursor = null }) {
      assertId(postId, "postId");
      const pageLimit = normalizeLimit(limit);
      const comments = await repository.listByPost({ postId, limit: pageLimit + 1, cursor });
      const hasNextPage = comments.length > pageLimit;
      const pageItems = hasNextPage ? comments.slice(0, pageLimit) : comments;
      const last = pageItems.at(-1);

      return {
        comments: pageItems,
        nextCursor: hasNextPage && last ? last.createdAt : null,
      };
    },

    async createComment({ postId, authorId, content }) {
      assertId(postId, "postId");
      assertId(authorId, "authorId");
      const normalizedContent = normalizeCommentContent(content);
      return repository.create({ postId, authorId, content: normalizedContent });
    },

    async deleteComment({ commentId, requesterId }) {
      assertId(commentId, "commentId");
      assertId(requesterId, "requesterId");
      await repository.deleteById({ commentId, requesterId });
    },
  };
}

export function createPostgresCommentsRepository(db) {
  if (!db || typeof db.query !== "function") {
    throw new Error("PostgreSQL query client is required");
  }

  return {
    async listByPost({ postId, limit, cursor }) {
      const result = await db.query(
        `
          SELECT
            c.id,
            c.post_id,
            c.author_id,
            c.content,
            c.created_at,
            c.updated_at,
            u.name AS author_name,
            u.avatar_url AS author_avatar_url
          FROM comments c
          JOIN users u ON u.id = c.author_id
          WHERE c.post_id = $1
            AND ($3::timestamptz IS NULL OR c.created_at > $3::timestamptz)
          ORDER BY c.created_at ASC, c.id ASC
          LIMIT $2
        `,
        [postId, limit, cursor],
      );
      return result.rows.map(mapCommentRow);
    },

    async create({ postId, authorId, content }) {
      const result = await db.query(
        `
          WITH inserted AS (
            INSERT INTO comments (post_id, author_id, content)
            SELECT $1, $2, $3
            WHERE EXISTS (SELECT 1 FROM posts WHERE id = $1)
            RETURNING id, post_id, author_id, content, created_at, updated_at
          )
          SELECT
            inserted.id,
            inserted.post_id,
            inserted.author_id,
            inserted.content,
            inserted.created_at,
            inserted.updated_at,
            u.name AS author_name,
            u.avatar_url AS author_avatar_url
          FROM inserted
          JOIN users u ON u.id = inserted.author_id
        `,
        [postId, authorId, content],
      );

      const row = result.rows[0];
      if (!row) {
        throw new ApiError(404, "NOT_FOUND", "Post not found");
      }
      return mapCommentRow(row);
    },

    async deleteById({ commentId, requesterId }) {
      const existing = await db.query("SELECT author_id FROM comments WHERE id = $1", [commentId]);
      const row = existing.rows[0];
      if (!row) {
        throw new ApiError(404, "NOT_FOUND", "Comment not found");
      }
      if (String(row.author_id) !== String(requesterId)) {
        throw new ApiError(403, "FORBIDDEN", "Only the comment author can delete this comment");
      }

      await db.query("DELETE FROM comments WHERE id = $1", [commentId]);
    },
  };
}

function normalizeCommentContent(content) {
  const normalized = String(content ?? "").trim();
  if (!normalized) {
    throw new ApiError(400, "VALIDATION_ERROR", "Comment content is required", { field: "content" });
  }
  if (normalized.length > MAX_COMMENT_CONTENT_LENGTH) {
    throw new ApiError(400, "VALIDATION_ERROR", "Comment content is too long", {
      field: "content",
      maxLength: MAX_COMMENT_CONTENT_LENGTH,
    });
  }
  return normalized;
}

function normalizeLimit(limit) {
  const parsed = Number(limit);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ApiError(400, "VALIDATION_ERROR", "Comment limit must be a positive integer", { field: "limit" });
  }
  return Math.min(parsed, MAX_COMMENT_LIMIT);
}

function assertId(value, field) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} is required`, { field });
  }
}

function mapCommentRow(row) {
  return {
    id: row.id,
    postId: row.post_id,
    content: row.content,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    author: {
      id: row.author_id,
      name: row.author_name || "Unknown user",
      avatarUrl: row.author_avatar_url || "",
    },
  };
}

function toIsoString(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(value).toISOString();
}
