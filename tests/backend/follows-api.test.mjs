import assert from "node:assert/strict";
import test from "node:test";
import { createFollowsService, createPostgresFollowsRepository } from "../../backend/src/follows/follows-service.mjs";
import { createFollowsHandlers, matchFollowsRoute } from "../../backend/src/follows/follows-routes.mjs";

test("matchFollowsRoute maps follow REST routes", () => {
  assert.deepEqual(matchFollowsRoute("POST", "/users/user_2/follow"), {
    action: "followUser",
    params: { userId: "user_2" },
  });
  assert.deepEqual(matchFollowsRoute("DELETE", "/users/user_2/follow"), {
    action: "unfollowUser",
    params: { userId: "user_2" },
  });
  assert.deepEqual(matchFollowsRoute("GET", "/users/user_2/follow-counts"), {
    action: "getFollowCounts",
    params: { userId: "user_2" },
  });
  assert.equal(matchFollowsRoute("POST", "/users/user_2/follow-counts"), null);
});

test("follows service delegates follow, unfollow, and count operations", async () => {
  const calls = [];
  const service = createFollowsService({
    repository: {
      async followUser(input) {
        calls.push(["follow", input]);
        return followState({ isFollowing: true, followerCount: 2 });
      },
      async unfollowUser(input) {
        calls.push(["unfollow", input]);
        return followState({ isFollowing: false, followerCount: 1 });
      },
      async getFollowState(input) {
        calls.push(["count", input]);
        return followState({ isFollowing: true, followerCount: 1 });
      },
    },
  });

  assert.deepEqual(
    await service.followUser({ followerId: "user_1", followeeId: "user_2" }),
    followState({ isFollowing: true, followerCount: 2 }),
  );
  assert.deepEqual(
    await service.unfollowUser({ followerId: "user_1", followeeId: "user_2" }),
    followState({ isFollowing: false, followerCount: 1 }),
  );
  assert.deepEqual(
    await service.getFollowCounts({ targetUserId: "user_2", viewerId: "user_1" }),
    followState({ isFollowing: true, followerCount: 1 }),
  );
  assert.deepEqual(calls, [
    ["follow", { followerId: "user_1", followeeId: "user_2" }],
    ["unfollow", { followerId: "user_1", followeeId: "user_2" }],
    ["count", { targetUserId: "user_2", viewerId: "user_1" }],
  ]);
});

test("follows service rejects missing ids and self-follow before repository calls", async () => {
  const service = createFollowsService({
    repository: {
      async followUser() {
        throw new Error("repository should not be called");
      },
    },
  });

  await assert.rejects(service.followUser({ followerId: "", followeeId: "user_2" }), /followerId is required/);
  await assert.rejects(service.followUser({ followerId: "user_1", followeeId: "" }), /followeeId is required/);
  await assert.rejects(service.followUser({ followerId: "user_1", followeeId: "user_1" }), /Users cannot follow themselves/);
});

test("PostgreSQL follows repository uses parameterized upsert, delete, and count queries", async () => {
  const queries = [];
  const repository = createPostgresFollowsRepository({
    async query(text, params) {
      queries.push({ text, params });
      return {
        rows: [
          {
            target_exists: true,
            is_following: true,
            follower_count: 3,
            following_count: 4,
          },
        ],
      };
    },
  });

  const followed = await repository.followUser({ followerId: "user_1", followeeId: "user_2" });
  const unfollowed = await repository.unfollowUser({ followerId: "user_1", followeeId: "user_2" });
  const count = await repository.getFollowState({ targetUserId: "user_2", viewerId: "user_1" });

  assert.deepEqual(followed, followState({ isFollowing: true, followerCount: 3, followingCount: 4 }));
  assert.deepEqual(unfollowed, followState({ isFollowing: true, followerCount: 3, followingCount: 4 }));
  assert.deepEqual(count, followState({ isFollowing: true, followerCount: 3, followingCount: 4 }));
  assert.deepEqual(queries.map((query) => query.params), [
    ["user_1", "user_2"],
    ["user_1", "user_2"],
    ["user_2", "user_1"],
  ]);
  assert.match(queries[0].text, /ON CONFLICT \(follower_id, followee_id\) DO NOTHING/);
  assert.match(queries[1].text, /DELETE FROM follows/);
  assert.match(queries[2].text, /count\(\*\)::int FROM follows WHERE followee_id = \$1/);
});

test("PostgreSQL follows repository rejects unknown target users", async () => {
  const repository = createPostgresFollowsRepository({
    async query() {
      return { rows: [{ target_exists: false, follower_count: 0, following_count: 0, is_following: false }] };
    },
  });

  await assert.rejects(repository.followUser({ followerId: "user_1", followeeId: "missing" }), /User not found/);
});

test("follows handlers return REST responses and error envelopes", async () => {
  const handlers = createFollowsHandlers({
    followsService: {
      async followUser() {
        return followState({ isFollowing: true, followerCount: 2 });
      },
      async unfollowUser() {
        return followState({ isFollowing: false, followerCount: 1 });
      },
      async getFollowCounts() {
        return followState({ isFollowing: false, followerCount: 1 });
      },
    },
  });

  const followed = await handlers.handle({
    method: "POST",
    path: "/users/user_2/follow",
    user: { id: "user_1" },
    requestId: "req_1",
  });
  assert.equal(followed.status, 200);
  assert.equal(followed.body.isFollowing, true);
  assert.equal(followed.body.followerCount, 2);

  const unfollowed = await handlers.handle({
    method: "DELETE",
    path: "/users/user_2/follow",
    user: { id: "user_1" },
    requestId: "req_2",
  });
  assert.equal(unfollowed.status, 200);
  assert.equal(unfollowed.body.isFollowing, false);

  const counts = await handlers.handle({
    method: "GET",
    path: "/users/user_2/follow-counts",
    requestId: "req_3",
  });
  assert.equal(counts.status, 200);
  assert.equal(counts.body.followerCount, 1);

  const unauthenticated = await handlers.handle({
    method: "POST",
    path: "/users/user_2/follow",
    requestId: "req_4",
  });
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.body.error.code, "UNAUTHENTICATED");
});

test("follows handlers log unexpected errors before returning generic 500", async () => {
  const logs = [];
  const handlers = createFollowsHandlers({
    followsService: {
      async followUser() {
        throw Object.assign(new Error("database unavailable"), { code: "ECONNREFUSED" });
      },
      async unfollowUser() {},
      async getFollowCounts() {},
    },
    logger: {
      error(message, metadata) {
        logs.push({ message, metadata });
      },
    },
  });

  const response = await handlers.handle({
    method: "POST",
    path: "/users/user_2/follow",
    user: { id: "user_1" },
    requestId: "req_5",
  });

  assert.equal(response.status, 500);
  assert.equal(response.body.error.code, "INTERNAL_SERVER_ERROR");
  assert.equal(logs[0].message, "Unhandled application error");
  assert.equal(logs[0].metadata.name, "Error");
  assert.equal(logs[0].metadata.code, "ECONNREFUSED");
  assert.equal(logs[0].metadata.message, "database unavailable");
  assert.match(logs[0].metadata.stack, /database unavailable/);
});

function followState({ isFollowing, followerCount, followingCount = 4 }) {
  return {
    targetUserId: "user_2",
    isFollowing,
    followerCount,
    followingCount,
  };
}
