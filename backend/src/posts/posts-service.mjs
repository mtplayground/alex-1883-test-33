import { ApiError } from "../../../scripts/error-response.mjs";

export const MAX_POST_CAPTION_LENGTH = 1000;

export function createPostsService({ repository }) {
  if (!repository) {
    throw new Error("posts repository is required");
  }

  return {
    async createPost({ authorId, imageUrl, caption = "" }) {
      assertId(authorId, "authorId");
      const normalizedImageUrl = normalizeImageUrl(imageUrl);
      const normalizedCaption = normalizeCaption(caption);
      return repository.create({
        authorId,
        imageUrl: normalizedImageUrl,
        caption: normalizedCaption,
      });
    },

    async getPostDetail({ postId, viewerId = null }) {
      assertId(postId, "postId");
      return repository.getDetail({ postId, viewerId });
    },
  };
}

export function createPostgresPostsRepository(db) {
  if (!db || typeof db.query !== "function") {
    throw new Error("PostgreSQL query client is required");
  }

  return {
    async create({ authorId, imageUrl, caption }) {
      const result = await db.query(
        `
          WITH inserted AS (
            INSERT INTO posts (author_id, image_url, caption)
            SELECT u.id, $2, $3
            FROM users u
            WHERE u.id = $1
            RETURNING id, author_id, image_url, caption, created_at, updated_at
          )
          SELECT
            inserted.id,
            inserted.author_id,
            inserted.image_url,
            inserted.caption,
            inserted.created_at,
            inserted.updated_at,
            u.name AS author_name,
            u.avatar_url AS author_avatar_url
          FROM inserted
          JOIN users u ON u.id = inserted.author_id
        `,
        [authorId, imageUrl, caption],
      );

      const row = result.rows[0];
      if (!row) {
        throw new ApiError(404, "NOT_FOUND", "Author not found");
      }
      return mapPostRow(row);
    },

    async getDetail({ postId, viewerId }) {
      const postResult = await db.query(
        `
          SELECT
            p.id,
            p.author_id,
            p.image_url,
            p.caption,
            p.created_at,
            p.updated_at,
            u.name AS author_name,
            u.avatar_url AS author_avatar_url,
            (SELECT count(*)::int FROM likes WHERE post_id = p.id) AS like_count,
            CASE
              WHEN $2::uuid IS NULL THEN false
              ELSE EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = $2)
            END AS is_liked,
            (SELECT count(*)::int FROM follows WHERE followee_id = p.author_id) AS follower_count,
            (SELECT count(*)::int FROM follows WHERE follower_id = p.author_id) AS following_count,
            CASE
              WHEN $2::uuid IS NULL THEN false
              ELSE EXISTS(SELECT 1 FROM follows WHERE follower_id = $2 AND followee_id = p.author_id)
            END AS is_following
          FROM posts p
          JOIN users u ON u.id = p.author_id
          WHERE p.id = $1
        `,
        [postId, viewerId],
      );

      const postRow = postResult.rows[0];
      if (!postRow) {
        throw new ApiError(404, "NOT_FOUND", "Post not found");
      }

      const commentsResult = await db.query(
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
          ORDER BY c.created_at ASC, c.id ASC
        `,
        [postId],
      );

      const followerCount = Number(postRow.follower_count);
      const followingCount = Number(postRow.following_count);

      return {
        post: mapPostRow(postRow),
        comments: commentsResult.rows.map(mapCommentRow),
        likeCount: Number(postRow.like_count),
        isLiked: Boolean(postRow.is_liked),
        authorStats: {
          followerCount,
          followingCount,
        },
        followState: {
          targetUserId: postRow.author_id,
          isFollowing: Boolean(postRow.is_following),
          followerCount,
          followingCount,
        },
      };
    },
  };
}

function normalizeImageUrl(imageUrl) {
  const normalized = String(imageUrl ?? "").trim();
  if (!normalized) {
    throw new ApiError(400, "VALIDATION_ERROR", "Post imageUrl is required", { field: "imageUrl" });
  }
  return normalized;
}

function normalizeCaption(caption) {
  const normalized = String(caption ?? "").trim();
  if (normalized.length > MAX_POST_CAPTION_LENGTH) {
    throw new ApiError(400, "VALIDATION_ERROR", "Post caption is too long", {
      field: "caption",
      maxLength: MAX_POST_CAPTION_LENGTH,
    });
  }
  return normalized;
}

function assertId(value, field) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} is required`, { field });
  }
}

function mapPostRow(row) {
  return {
    id: row.id,
    imageUrl: row.image_url,
    caption: row.caption || "",
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    author: {
      id: row.author_id,
      name: row.author_name || "Unknown user",
      avatarUrl: row.author_avatar_url || "",
    },
  };
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
