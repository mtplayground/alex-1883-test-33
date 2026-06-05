import assert from "node:assert/strict";
import test from "node:test";
import {
  appendFeedPage,
  createFeedState,
  failFeedLoad,
  getFeedView,
  markFeedLoading,
  normalizeFeedPage,
} from "../../frontend/src/feed/feed-page.mjs";

const createdAt = "2026-06-05T03:00:00.000Z";

test("feed view exposes empty and load-more states", () => {
  const empty = createFeedState();
  assert.equal(getFeedView(empty).isEmpty, true);
  assert.equal(getFeedView(empty).canLoadMore, false);

  const withCursor = createFeedState({
    posts: [post({ id: "post_1" })],
    nextCursor: "cursor_1",
  });
  const view = getFeedView(withCursor);
  assert.equal(view.isEmpty, false);
  assert.equal(view.canLoadMore, true);
  assert.equal(view.posts[0].displayTime.length > 0, true);
});

test("appendFeedPage deduplicates posts while preserving order", () => {
  const state = createFeedState({
    posts: [post({ id: "post_1" }), post({ id: "post_2" })],
    nextCursor: "cursor_1",
  });

  const next = appendFeedPage(state, {
    posts: [post({ id: "post_2" }), post({ id: "post_3" })],
    nextCursor: "cursor_2",
  });

  assert.deepEqual(
    next.posts.map((item) => item.id),
    ["post_1", "post_2", "post_3"],
  );
  assert.equal(next.nextCursor, "cursor_2");
  assert.equal(next.hasNextPage, true);
});

test("appendFeedPage clears pagination when no next cursor exists", () => {
  const state = markFeedLoading(
    createFeedState({
      posts: [post({ id: "post_1" })],
      nextCursor: "cursor_1",
    }),
  );

  const next = appendFeedPage(state, {
    posts: [post({ id: "post_2" })],
    nextCursor: null,
  });

  assert.equal(next.isLoading, false);
  assert.equal(next.hasNextPage, false);
  assert.equal(getFeedView(next).canLoadMore, false);
});

test("failFeedLoad keeps existing posts and shows a safe error", () => {
  const state = markFeedLoading(
    createFeedState({
      posts: [post({ id: "post_1" })],
      nextCursor: "cursor_1",
    }),
  );

  const next = failFeedLoad(state, new Error("Feed service unavailable"));

  assert.deepEqual(
    next.posts.map((item) => item.id),
    ["post_1"],
  );
  assert.equal(next.isLoading, false);
  assert.equal(next.errorMessage, "Feed service unavailable");
  assert.equal(getFeedView(next).canLoadMore, true);
});

test("normalizeFeedPage accepts common API response envelopes", () => {
  const direct = normalizeFeedPage({
    posts: [post({ id: "post_1" })],
    nextCursor: "cursor_1",
  });
  assert.equal(direct.posts.length, 1);
  assert.equal(direct.nextCursor, "cursor_1");

  const nested = normalizeFeedPage({
    data: {
      items: [post({ id: "post_2" })],
      cursor: "cursor_2",
    },
  });
  assert.equal(nested.posts[0].id, "post_2");
  assert.equal(nested.nextCursor, "cursor_2");
});

test("feed state rejects invalid post cards", () => {
  assert.throws(() => createFeedState({ posts: [{ id: "post_1" }] }), /post.imageUrl is required/);
  assert.throws(
    () =>
      createFeedState({
        posts: [{ id: "post_1", imageUrl: "https://example.com/post.png", author: {} }],
      }),
    /post.author.id is required/,
  );
});

function post({ id }) {
  return {
    id,
    imageUrl: `https://example.com/${id}.png`,
    caption: `Caption ${id}`,
    createdAt,
    author: {
      id: "user_1",
      name: "Ada",
      avatarUrl: "",
    },
  };
}
