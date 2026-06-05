import { ApiError } from "../../../scripts/error-response.mjs";

export function createLikesService({ repository }) {
  if (!repository) {
    throw new Error("likes repository is required");
  }

  return {
    async likePost({ postId, userId }) {
      assertId(postId, "postId");
      assertId(userId, "userId");
      return repository.likePost({ postId, userId });
    },

    async unlikePost({ postId, userId }) {
      assertId(postId, "postId");
      assertId(userId, "userId");
      return repository.unlikePost({ postId, userId });
    },

    async getLikeCount({ postId, userId = null }) {
      assertId(postId, "postId");
      return repository.getLikeState({ postId, userId });
    },
  };
}

export function createPostgresLikesRepository(db) {
  if (!db || typeof db.query !== "function") {
    throw new Error("PostgreSQL query client is required");
  }

  return {
    async likePost({ postId, userId }) {
      const result = await db.query(
        `
          WITH target_post AS (
            SELECT id FROM posts WHERE id = $1
          ),
          inserted AS (
            INSERT INTO likes (post_id, user_id)
            SELECT id, $2 FROM target_post
            ON CONFLICT (post_id, user_id) DO NOTHING
            RETURNING post_id
          )
          SELECT
            EXISTS(SELECT 1 FROM target_post) AS post_exists,
            (SELECT count(*)::int FROM likes WHERE post_id = $1) AS like_count
        `,
        [postId, userId],
      );

      return mapLikeMutation(rowOrNotFound(result), postId, true);
    },

    async unlikePost({ postId, userId }) {
      const result = await db.query(
        `
          WITH target_post AS (
            SELECT id FROM posts WHERE id = $1
          ),
          deleted AS (
            DELETE FROM likes
            WHERE post_id = $1 AND user_id = $2
            RETURNING post_id
          )
          SELECT
            EXISTS(SELECT 1 FROM target_post) AS post_exists,
            (SELECT count(*)::int FROM likes WHERE post_id = $1) AS like_count
        `,
        [postId, userId],
      );

      return mapLikeMutation(rowOrNotFound(result), postId, false);
    },

    async getLikeState({ postId, userId }) {
      const result = await db.query(
        `
          WITH target_post AS (
            SELECT id FROM posts WHERE id = $1
          )
          SELECT
            EXISTS(SELECT 1 FROM target_post) AS post_exists,
            (SELECT count(*)::int FROM likes WHERE post_id = $1) AS like_count,
            CASE
              WHEN $2::uuid IS NULL THEN false
              ELSE EXISTS(SELECT 1 FROM likes WHERE post_id = $1 AND user_id = $2)
            END AS is_liked
        `,
        [postId, userId],
      );

      const row = rowOrNotFound(result);
      return {
        postId,
        likeCount: Number(row.like_count),
        isLiked: Boolean(row.is_liked),
      };
    },
  };
}

function rowOrNotFound(result) {
  const row = result.rows[0];
  if (!row || !row.post_exists) {
    throw new ApiError(404, "NOT_FOUND", "Post not found");
  }
  return row;
}

function mapLikeMutation(row, postId, isLiked) {
  return {
    postId,
    isLiked,
    likeCount: Number(row.like_count),
  };
}

function assertId(value, field) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} is required`, { field });
  }
}
