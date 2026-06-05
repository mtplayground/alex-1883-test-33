import assert from "node:assert/strict";
import test from "node:test";
import { createLikesService, createPostgresLikesRepository } from "../../backend/src/likes/likes-service.mjs";
import { createLikesHandlers, matchLikesRoute } from "../../backend/src/likes/likes-routes.mjs";

test("matchLikesRoute maps like REST routes", () => {
  assert.deepEqual(matchLikesRoute("POST", "/posts/post_1/like"), {
    action: "likePost",
    params: { postId: "post_1" },
  });
  assert.deepEqual(matchLikesRoute("DELETE", "/posts/post_1/like"), {
    action: "unlikePost",
    params: { postId: "post_1" },
  });
  assert.deepEqual(matchLikesRoute("GET", "/posts/post_1/likes"), {
    action: "getLikeCount",
    params: { postId: "post_1" },
  });
  assert.equal(matchLikesRoute("POST", "/posts/post_1/likes"), null);
});

test("likes service delegates like, unlike, and count operations", async () => {
  const calls = [];
  const service = createLikesService({
    repository: {
      async likePost(input) {
        calls.push(["like", input]);
        return likeState({ isLiked: true, likeCount: 2 });
      },
      async unlikePost(input) {
        calls.push(["unlike", input]);
        return likeState({ isLiked: false, likeCount: 1 });
      },
      async getLikeState(input) {
        calls.push(["count", input]);
        return likeState({ isLiked: true, likeCount: 1 });
      },
    },
  });

  assert.deepEqual(await service.likePost({ postId: "post_1", userId: "user_1" }), likeState({ isLiked: true, likeCount: 2 }));
  assert.deepEqual(await service.unlikePost({ postId: "post_1", userId: "user_1" }), likeState({ isLiked: false, likeCount: 1 }));
  assert.deepEqual(await service.getLikeCount({ postId: "post_1", userId: "user_1" }), likeState({ isLiked: true, likeCount: 1 }));
  assert.deepEqual(calls, [
    ["like", { postId: "post_1", userId: "user_1" }],
    ["unlike", { postId: "post_1", userId: "user_1" }],
    ["count", { postId: "post_1", userId: "user_1" }],
  ]);
});

test("likes service rejects missing ids before repository calls", async () => {
  const service = createLikesService({
    repository: {
      async likePost() {
        throw new Error("repository should not be called");
      },
    },
  });

  await assert.rejects(service.likePost({ postId: "", userId: "user_1" }), /postId is required/);
  await assert.rejects(service.likePost({ postId: "post_1", userId: "" }), /userId is required/);
});

test("PostgreSQL likes repository uses parameterized upsert and delete queries", async () => {
  const queries = [];
  const repository = createPostgresLikesRepository({
    async query(text, params) {
      queries.push({ text, params });
      return { rows: [{ post_exists: true, like_count: 3, is_liked: true }] };
    },
  });

  const liked = await repository.likePost({ postId: "post_1", userId: "user_1" });
  const unliked = await repository.unlikePost({ postId: "post_1", userId: "user_1" });
  const count = await repository.getLikeState({ postId: "post_1", userId: "user_1" });

  assert.deepEqual(liked, likeState({ isLiked: true, likeCount: 3 }));
  assert.deepEqual(unliked, likeState({ isLiked: false, likeCount: 3 }));
  assert.deepEqual(count, likeState({ isLiked: true, likeCount: 3 }));
  assert.deepEqual(queries.map((query) => query.params), [
    ["post_1", "user_1"],
    ["post_1", "user_1"],
    ["post_1", "user_1"],
  ]);
  assert.match(queries[0].text, /ON CONFLICT \(user_id, post_id\) DO NOTHING/);
  assert.match(queries[1].text, /DELETE FROM likes/);
  assert.match(queries[2].text, /count\(\*\)::int FROM likes/);
});

test("PostgreSQL likes repository rejects unknown posts", async () => {
  const repository = createPostgresLikesRepository({
    async query() {
      return { rows: [{ post_exists: false, like_count: 0, is_liked: false }] };
    },
  });

  await assert.rejects(repository.likePost({ postId: "missing", userId: "user_1" }), /Post not found/);
});

test("likes handlers return REST responses and error envelopes", async () => {
  const handlers = createLikesHandlers({
    likesService: {
      async likePost() {
        return likeState({ isLiked: true, likeCount: 2 });
      },
      async unlikePost() {
        return likeState({ isLiked: false, likeCount: 1 });
      },
      async getLikeCount() {
        return likeState({ isLiked: false, likeCount: 1 });
      },
    },
  });

  const liked = await handlers.handle({
    method: "POST",
    path: "/posts/post_1/like",
    user: { id: "user_1" },
    requestId: "req_1",
  });
  assert.equal(liked.status, 200);
  assert.equal(liked.body.isLiked, true);
  assert.equal(liked.body.likeCount, 2);

  const unliked = await handlers.handle({
    method: "DELETE",
    path: "/posts/post_1/like",
    user: { id: "user_1" },
    requestId: "req_2",
  });
  assert.equal(unliked.status, 200);
  assert.equal(unliked.body.isLiked, false);

  const count = await handlers.handle({
    method: "GET",
    path: "/posts/post_1/likes",
    requestId: "req_3",
  });
  assert.equal(count.status, 200);
  assert.equal(count.body.likeCount, 1);

  const unauthenticated = await handlers.handle({
    method: "POST",
    path: "/posts/post_1/like",
    requestId: "req_4",
  });
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.body.error.code, "UNAUTHENTICATED");
});

function likeState({ isLiked, likeCount }) {
  return {
    postId: "post_1",
    isLiked,
    likeCount,
  };
}
