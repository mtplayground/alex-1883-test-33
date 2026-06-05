import { ApiError } from "../../../scripts/error-response.mjs";

export const DEFAULT_FEED_LIMIT = 20;
export const MAX_FEED_LIMIT = 50;

export function createFeedService({ repository }) {
  if (!repository) {
    throw new Error("feed repository is required");
  }

  return {
    async listFeed({ userId, limit = DEFAULT_FEED_LIMIT, cursor = null }) {
      assertId(userId, "userId");
      const pageLimit = normalizeLimit(limit);
      const decodedCursor = decodeFeedCursor(cursor);
      const rows = await repository.listForUser({
        userId,
        limit: pageLimit + 1,
        cursor: decodedCursor,
      });
      const hasNextPage = rows.length > pageLimit;
      const posts = hasNextPage ? rows.slice(0, pageLimit) : rows;
      const last = posts.at(-1);

      return {
        posts,
        nextCursor: hasNextPage && last ? encodeFeedCursor(last) : null,
      };
    },
  };
}

export function createPostgresFeedRepository(db) {
  if (!db || typeof db.query !== "function") {
    throw new Error("PostgreSQL query client is required");
  }

  return {
    async listForUser({ userId, limit, cursor }) {
      const result = await db.query(
        `
          SELECT
            p.id,
            p.author_id,
            p.image_url,
            p.caption,
            p.created_at,
            u.name AS author_name,
            u.avatar_url AS author_avatar_url
          FROM posts p
          JOIN users u ON u.id = p.author_id
          WHERE (
              p.author_id = $1
              OR EXISTS (
                SELECT 1
                FROM follows f
                WHERE f.follower_id = $1
                  AND f.followee_id = p.author_id
              )
            )
            AND (
              $3::timestamptz IS NULL
              OR (p.created_at, p.id) < ($3::timestamptz, $4::uuid)
            )
          ORDER BY p.created_at DESC, p.id DESC
          LIMIT $2
        `,
        [userId, limit, cursor?.createdAt ?? null, cursor?.id ?? null],
      );

      return result.rows.map(mapPostRow);
    },
  };
}

export function encodeFeedCursor(post) {
  if (!post?.createdAt || post.id === undefined || post.id === null) {
    throw new ApiError(500, "INTERNAL_SERVER_ERROR", "Feed cursor cannot be created");
  }

  const payload = JSON.stringify({
    createdAt: normalizeDate(post.createdAt),
    id: String(post.id),
  });
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodeFeedCursor(cursor) {
  if (cursor === undefined || cursor === null || String(cursor).trim() === "") {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") {
      throw new Error("cursor payload must be an object");
    }

    return {
      createdAt: normalizeDate(parsed.createdAt),
      id: assertCursorId(parsed.id),
    };
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "Feed cursor is invalid", { field: "cursor" });
  }
}

function normalizeLimit(limit) {
  const parsed = Number(limit);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ApiError(400, "VALIDATION_ERROR", "Feed limit must be a positive integer", { field: "limit" });
  }
  return Math.min(parsed, MAX_FEED_LIMIT);
}

function assertId(value, field) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} is required`, { field });
  }
}

function assertCursorId(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error("cursor id is required");
  }
  return String(value);
}

function mapPostRow(row) {
  return {
    id: row.id,
    imageUrl: row.image_url,
    caption: row.caption || "",
    createdAt: normalizeDate(row.created_at),
    author: {
      id: row.author_id,
      name: row.author_name || "Unknown user",
      avatarUrl: row.author_avatar_url || "",
    },
  };
}

function normalizeDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Feed cursor date is invalid");
  }
  return date.toISOString();
}
