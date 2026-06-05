import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_FEED_LIMIT,
  createFeedService,
  createPostgresFeedRepository,
  decodeFeedCursor,
  encodeFeedCursor,
} from "../../backend/src/feed/feed-service.mjs";
import { createFeedHandlers, matchFeedRoute } from "../../backend/src/feed/feed-routes.mjs";

const newest = new Date("2026-06-05T04:00:00.000Z");
const older = new Date("2026-06-05T03:00:00.000Z");

test("matchFeedRoute maps the feed REST route", () => {
  assert.deepEqual(matchFeedRoute("GET", "/feed?limit=20"), {
    action: "listFeed",
    params: {},
  });
  assert.deepEqual(matchFeedRoute("GET", "/feed/"), {
    action: "listFeed",
    params: {},
  });
  assert.equal(matchFeedRoute("POST", "/feed"), null);
  assert.equal(matchFeedRoute("GET", "/posts/post_1"), null);
});

test("feed service returns current user and followed-user posts with cursor pagination", async () => {
  const calls = [];
  const service = createFeedService({
    repository: {
      async listForUser(input) {
        calls.push(input);
        return [
          post({ id: "post_3", authorId: "followed_user", createdAt: newest }),
          post({ id: "post_2", authorId: "user_1", createdAt: older }),
          post({ id: "post_1", authorId: "followed_user", createdAt: new Date("2026-06-05T02:00:00.000Z") }),
        ];
      },
    },
  });

  const page = await service.listFeed({ userId: "user_1", limit: 2 });

  assert.deepEqual(
    page.posts.map((item) => item.id),
    ["post_3", "post_2"],
  );
  assert.equal(typeof page.nextCursor, "string");
  assert.deepEqual(decodeFeedCursor(page.nextCursor), {
    createdAt: older.toISOString(),
    id: "post_2",
  });
  assert.deepEqual(calls, [{ userId: "user_1", limit: 3, cursor: null }]);
});

test("feed service validates user, limit, and cursor before repository calls", async () => {
  const service = createFeedService({
    repository: {
      async listForUser() {
        throw new Error("repository should not be called");
      },
    },
  });

  await assert.rejects(service.listFeed({ userId: "", limit: 20 }), /userId is required/);
  await assert.rejects(service.listFeed({ userId: "user_1", limit: 0 }), /Feed limit must be a positive integer/);
  await assert.rejects(service.listFeed({ userId: "user_1", cursor: "bad-cursor" }), /Feed cursor is invalid/);
});

test("feed service caps oversized page limits", async () => {
  const calls = [];
  const service = createFeedService({
    repository: {
      async listForUser(input) {
        calls.push(input);
        return [];
      },
    },
  });

  await service.listFeed({ userId: "user_1", limit: MAX_FEED_LIMIT + 100 });
  assert.equal(calls[0].limit, MAX_FEED_LIMIT + 1);
});

test("PostgreSQL feed repository aggregates self and followee posts using parameterized cursor query", async () => {
  const queries = [];
  const repository = createPostgresFeedRepository({
    async query(text, params) {
      queries.push({ text, params });
      return {
        rows: [
          {
            id: "post_2",
            author_id: "followed_user",
            image_url: "https://example.com/post_2.png",
            caption: "followed",
            created_at: newest,
            author_name: "Grace",
            author_avatar_url: "https://example.com/grace.png",
          },
          {
            id: "post_1",
            author_id: "user_1",
            image_url: "https://example.com/post_1.png",
            caption: null,
            created_at: older,
            author_name: "Ada",
            author_avatar_url: null,
          },
        ],
      };
    },
  });

  const cursor = { createdAt: older.toISOString(), id: "00000000-0000-0000-0000-000000000001" };
  const posts = await repository.listForUser({ userId: "user_1", limit: 21, cursor });

  assert.deepEqual(posts.map((item) => item.id), ["post_2", "post_1"]);
  assert.equal(posts[0].author.name, "Grace");
  assert.equal(posts[1].caption, "");
  assert.deepEqual(queries[0].params, ["user_1", 21, cursor.createdAt, cursor.id]);
  assert.match(queries[0].text, /FROM posts p/);
  assert.match(queries[0].text, /FROM follows f/);
  assert.match(queries[0].text, /f\.follower_id = \$1/);
  assert.match(queries[0].text, /f\.followee_id = p\.author_id/);
  assert.match(queries[0].text, /ORDER BY p\.created_at DESC, p\.id DESC/);
  assert.match(queries[0].text, /LIMIT \$2/);
});

test("feed handlers require authentication and return REST responses", async () => {
  const calls = [];
  const handlers = createFeedHandlers({
    feedService: {
      async listFeed(input) {
        calls.push(input);
        return {
          posts: [post({ id: "post_1", authorId: "user_1", createdAt: newest })],
          nextCursor: null,
        };
      },
    },
  });

  const response = await handlers.handle({
    method: "GET",
    path: "/feed?limit=10&cursor=abc",
    user: { id: "user_1" },
    requestId: "req_1",
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.posts.length, 1);
  assert.deepEqual(calls, [{ userId: "user_1", limit: "10", cursor: "abc" }]);

  const unauthenticated = await handlers.handle({
    method: "GET",
    path: "/feed",
    requestId: "req_2",
  });
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.body.error.code, "UNAUTHENTICATED");
});

test("feed handlers log unexpected errors before returning a generic 500", async () => {
  const logs = [];
  const handlers = createFeedHandlers({
    feedService: {
      async listFeed() {
        throw Object.assign(new Error("database unavailable"), { code: "ECONNREFUSED" });
      },
    },
    logger: {
      error(message, metadata) {
        logs.push({ message, metadata });
      },
    },
  });

  const response = await handlers.handle({
    method: "GET",
    path: "/feed",
    user: { id: "user_1" },
    requestId: "req_3",
  });

  assert.equal(response.status, 500);
  assert.equal(response.body.error.code, "INTERNAL_SERVER_ERROR");
  assert.equal(logs[0].message, "Unhandled application error");
  assert.equal(logs[0].metadata.name, "Error");
  assert.equal(logs[0].metadata.code, "ECONNREFUSED");
  assert.equal(logs[0].metadata.message, "database unavailable");
  assert.match(logs[0].metadata.stack, /database unavailable/);
});

test("feed cursors are opaque and round-trip post order keys", () => {
  const cursor = encodeFeedCursor({ id: "post_1", createdAt: newest });
  assert.deepEqual(decodeFeedCursor(cursor), {
    id: "post_1",
    createdAt: newest.toISOString(),
  });
});

function post({ id, authorId, createdAt }) {
  return {
    id,
    imageUrl: `https://example.com/${id}.png`,
    caption: `Caption ${id}`,
    createdAt: createdAt.toISOString(),
    author: {
      id: authorId,
      name: authorId === "user_1" ? "Ada" : "Grace",
      avatarUrl: "",
    },
  };
}
