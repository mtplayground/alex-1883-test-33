import { ApiError } from "../../../scripts/error-response.mjs";

export function createFollowsService({ repository }) {
  if (!repository) {
    throw new Error("follows repository is required");
  }

  return {
    async followUser({ followerId, followeeId }) {
      assertId(followerId, "followerId");
      assertId(followeeId, "followeeId");
      assertNotSelfFollow(followerId, followeeId);
      return repository.followUser({ followerId, followeeId });
    },

    async unfollowUser({ followerId, followeeId }) {
      assertId(followerId, "followerId");
      assertId(followeeId, "followeeId");
      assertNotSelfFollow(followerId, followeeId);
      return repository.unfollowUser({ followerId, followeeId });
    },

    async getFollowCounts({ targetUserId, viewerId = null }) {
      assertId(targetUserId, "targetUserId");
      return repository.getFollowState({ targetUserId, viewerId });
    },
  };
}

export function createPostgresFollowsRepository(db) {
  if (!db || typeof db.query !== "function") {
    throw new Error("PostgreSQL query client is required");
  }

  return {
    async followUser({ followerId, followeeId }) {
      const result = await db.query(
        `
          WITH target_user AS (
            SELECT id FROM users WHERE id = $2
          ),
          inserted AS (
            INSERT INTO follows (follower_id, followee_id)
            SELECT $1, id FROM target_user
            ON CONFLICT (follower_id, followee_id) DO NOTHING
            RETURNING followee_id
          )
          SELECT
            EXISTS(SELECT 1 FROM target_user) AS target_exists,
            (SELECT count(*)::int FROM follows WHERE followee_id = $2) AS follower_count,
            (SELECT count(*)::int FROM follows WHERE follower_id = $2) AS following_count,
            EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2) AS is_following
        `,
        [followerId, followeeId],
      );

      return mapFollowState(rowOrNotFound(result), followeeId);
    },

    async unfollowUser({ followerId, followeeId }) {
      const result = await db.query(
        `
          WITH target_user AS (
            SELECT id FROM users WHERE id = $2
          ),
          deleted AS (
            DELETE FROM follows
            WHERE follower_id = $1 AND followee_id = $2
            RETURNING followee_id
          )
          SELECT
            EXISTS(SELECT 1 FROM target_user) AS target_exists,
            (SELECT count(*)::int FROM follows WHERE followee_id = $2) AS follower_count,
            (SELECT count(*)::int FROM follows WHERE follower_id = $2) AS following_count,
            EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2) AS is_following
        `,
        [followerId, followeeId],
      );

      return mapFollowState(rowOrNotFound(result), followeeId);
    },

    async getFollowState({ targetUserId, viewerId }) {
      const result = await db.query(
        `
          WITH target_user AS (
            SELECT id FROM users WHERE id = $1
          )
          SELECT
            EXISTS(SELECT 1 FROM target_user) AS target_exists,
            (SELECT count(*)::int FROM follows WHERE followee_id = $1) AS follower_count,
            (SELECT count(*)::int FROM follows WHERE follower_id = $1) AS following_count,
            CASE
              WHEN $2::uuid IS NULL THEN false
              ELSE EXISTS(SELECT 1 FROM follows WHERE follower_id = $2 AND followee_id = $1)
            END AS is_following
        `,
        [targetUserId, viewerId],
      );

      return mapFollowState(rowOrNotFound(result), targetUserId);
    },
  };
}

function rowOrNotFound(result) {
  const row = result.rows[0];
  if (!row || !row.target_exists) {
    throw new ApiError(404, "NOT_FOUND", "User not found");
  }
  return row;
}

function mapFollowState(row, targetUserId) {
  return {
    targetUserId,
    isFollowing: Boolean(row.is_following),
    followerCount: Number(row.follower_count),
    followingCount: Number(row.following_count),
  };
}

function assertNotSelfFollow(followerId, followeeId) {
  if (String(followerId) === String(followeeId)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Users cannot follow themselves", { field: "followeeId" });
  }
}

function assertId(value, field) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} is required`, { field });
  }
}
