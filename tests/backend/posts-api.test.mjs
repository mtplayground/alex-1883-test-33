import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_POST_CAPTION_LENGTH,
  createPostgresPostsRepository,
  createPostsService,
} from "../../backend/src/posts/posts-service.mjs";
import { createPostsHandlers, matchPostsRoute } from "../../backend/src/posts/posts-routes.mjs";

const createdAt = new Date("2026-06-05T04:00:00.000Z");

test("matchPostsRoute maps the create post REST route", () => {
  assert.deepEqual(matchPostsRoute("POST", "/posts"), {
    action: "createPost",
    params: {},
  });
  assert.deepEqual(matchPostsRoute("POST", "/posts/"), {
    action: "createPost",
    params: {},
  });
  assert.equal(matchPostsRoute("GET", "/posts"), null);
});

test("posts service creates trimmed post records through the repository", async () => {
  const calls = [];
  const service = createPostsService({
    repository: {
      async create(input) {
        calls.push(input);
        return postRow({ caption: input.caption, imageUrl: input.imageUrl });
      },
    },
  });

  const post = await service.createPost({
    authorId: "user_1",
    imageUrl: "  https://example.com/upload.png  ",
    caption: "  hello  ",
  });

  assert.equal(post.caption, "hello");
  assert.equal(post.imageUrl, "https://example.com/upload.png");
  assert.deepEqual(calls, [
    {
      authorId: "user_1",
      imageUrl: "https://example.com/upload.png",
      caption: "hello",
    },
  ]);
});

test("posts service rejects missing auth, image URLs, and overlong captions", async () => {
  const service = createPostsService({
    repository: {
      async create() {
        throw new Error("repository should not be called");
      },
    },
  });

  await assert.rejects(service.createPost({ authorId: "", imageUrl: "https://example.com/image.png" }), /authorId is required/);
  await assert.rejects(service.createPost({ authorId: "user_1", imageUrl: "" }), /Post imageUrl is required/);
  await assert.rejects(
    service.createPost({
      authorId: "user_1",
      imageUrl: "https://example.com/image.png",
      caption: "x".repeat(MAX_POST_CAPTION_LENGTH + 1),
    }),
    /Post caption is too long/,
  );
});

test("PostgreSQL posts repository inserts posts with author summaries through parameterized queries", async () => {
  const queries = [];
  const repository = createPostgresPostsRepository({
    async query(text, params) {
      queries.push({ text, params });
      return {
        rows: [
          {
            id: "post_1",
            author_id: "user_1",
            image_url: "https://example.com/upload.png",
            caption: "hello",
            created_at: createdAt,
            updated_at: createdAt,
            author_name: "Ada",
            author_avatar_url: "https://example.com/ada.png",
          },
        ],
      };
    },
  });

  const post = await repository.create({
    authorId: "user_1",
    imageUrl: "https://example.com/upload.png",
    caption: "hello",
  });

  assert.equal(post.id, "post_1");
  assert.equal(post.author.name, "Ada");
  assert.equal(post.createdAt, createdAt.toISOString());
  assert.deepEqual(queries[0].params, ["user_1", "https://example.com/upload.png", "hello"]);
  assert.match(queries[0].text, /INSERT INTO posts \(author_id, image_url, caption\)/);
  assert.match(queries[0].text, /WHERE u\.id = \$1/);
  assert.match(queries[0].text, /JOIN users u ON u\.id = inserted\.author_id/);
});

test("PostgreSQL posts repository rejects unknown authors", async () => {
  const repository = createPostgresPostsRepository({
    async query() {
      return { rows: [] };
    },
  });

  await assert.rejects(
    repository.create({ authorId: "missing", imageUrl: "https://example.com/image.png", caption: "" }),
    /Author not found/,
  );
});

test("posts handlers return REST responses and error envelopes", async () => {
  const calls = [];
  const handlers = createPostsHandlers({
    postsService: {
      async createPost(input) {
        calls.push(input);
        return postRow({ caption: input.caption, imageUrl: input.imageUrl });
      },
    },
  });

  const created = await handlers.handle({
    method: "POST",
    path: "/posts",
    user: { id: "user_1" },
    body: {
      imageUrl: "https://example.com/upload.png",
      description: "from upload",
    },
    requestId: "req_1",
  });

  assert.equal(created.status, 201);
  assert.equal(created.body.post.caption, "from upload");
  assert.deepEqual(calls, [
    {
      authorId: "user_1",
      imageUrl: "https://example.com/upload.png",
      caption: "from upload",
    },
  ]);

  const unauthenticated = await handlers.handle({
    method: "POST",
    path: "/posts",
    body: { imageUrl: "https://example.com/upload.png" },
    requestId: "req_2",
  });
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.body.error.code, "UNAUTHENTICATED");
});

test("posts handlers log unexpected errors before returning generic 500", async () => {
  const logs = [];
  const handlers = createPostsHandlers({
    postsService: {
      async createPost() {
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
    method: "POST",
    path: "/posts",
    user: { id: "user_1" },
    body: { imageUrl: "https://example.com/upload.png" },
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

function postRow({ caption, imageUrl }) {
  return {
    id: "post_1",
    imageUrl,
    caption,
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
    author: {
      id: "user_1",
      name: "Ada",
      avatarUrl: "",
    },
  };
}
