import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_COMMENT_CONTENT_LENGTH,
  createCommentsService,
  createPostgresCommentsRepository,
} from "../../backend/src/comments/comments-service.mjs";
import { createCommentsHandlers, matchCommentsRoute } from "../../backend/src/comments/comments-routes.mjs";

const createdAt = new Date("2026-06-05T03:00:00.000Z");

test("matchCommentsRoute maps comment REST routes", () => {
  assert.deepEqual(matchCommentsRoute("GET", "/posts/post_1/comments?limit=20"), {
    action: "listComments",
    params: { postId: "post_1" },
  });
  assert.deepEqual(matchCommentsRoute("POST", "/posts/post_1/comments"), {
    action: "createComment",
    params: { postId: "post_1" },
  });
  assert.deepEqual(matchCommentsRoute("DELETE", "/comments/comment_1"), {
    action: "deleteComment",
    params: { commentId: "comment_1" },
  });
  assert.equal(matchCommentsRoute("GET", "/comments/comment_1"), null);
});

test("comments service creates trimmed comments through the repository", async () => {
  const calls = [];
  const service = createCommentsService({
    repository: {
      async create(input) {
        calls.push(input);
        return commentRow({ id: "comment_1", content: input.content });
      },
    },
  });

  const comment = await service.createComment({
    postId: "post_1",
    authorId: "user_1",
    content: "  hello  ",
  });

  assert.equal(comment.content, "hello");
  assert.deepEqual(calls, [{ postId: "post_1", authorId: "user_1", content: "hello" }]);
});

test("comments service rejects empty and overlong content", async () => {
  const service = createCommentsService({
    repository: {
      async create() {
        throw new Error("repository should not be called");
      },
    },
  });

  await assert.rejects(
    service.createComment({ postId: "post_1", authorId: "user_1", content: " " }),
    /Comment content is required/,
  );
  await assert.rejects(
    service.createComment({
      postId: "post_1",
      authorId: "user_1",
      content: "x".repeat(MAX_COMMENT_CONTENT_LENGTH + 1),
    }),
    /Comment content is too long/,
  );
});

test("comments service lists comments with bounded pagination", async () => {
  const service = createCommentsService({
    repository: {
      async listByPost(input) {
        assert.deepEqual(input, { postId: "post_1", limit: 3, cursor: null });
        return [
          commentRow({ id: "comment_1" }),
          commentRow({ id: "comment_2" }),
          commentRow({ id: "comment_3" }),
        ];
      },
    },
  });

  const result = await service.listComments({ postId: "post_1", limit: 2 });

  assert.deepEqual(
    result.comments.map((comment) => comment.id),
    ["comment_1", "comment_2"],
  );
  assert.equal(result.nextCursor, "2026-06-05T03:00:00.000Z");
});

test("comments service deletes comments through the repository", async () => {
  const calls = [];
  const service = createCommentsService({
    repository: {
      async deleteById(input) {
        calls.push(input);
      },
    },
  });

  await service.deleteComment({ commentId: "comment_1", requesterId: "user_1" });
  assert.deepEqual(calls, [{ commentId: "comment_1", requesterId: "user_1" }]);
});

test("PostgreSQL repository maps inserted comments and uses parameterized queries", async () => {
  const queries = [];
  const repository = createPostgresCommentsRepository({
    async query(text, params) {
      queries.push({ text, params });
      return {
        rows: [
          {
            id: "comment_1",
            post_id: "post_1",
            author_id: "user_1",
            content: "hello",
            created_at: createdAt,
            updated_at: createdAt,
            author_name: "Ada",
            author_avatar_url: "https://example.com/avatar.png",
          },
        ],
      };
    },
  });

  const comment = await repository.create({
    postId: "post_1",
    authorId: "user_1",
    content: "hello",
  });

  assert.equal(comment.id, "comment_1");
  assert.equal(comment.author.name, "Ada");
  assert.deepEqual(queries[0].params, ["post_1", "user_1", "hello"]);
  assert.match(queries[0].text, /\$1/);
  assert.match(queries[0].text, /\$2/);
  assert.match(queries[0].text, /\$3/);
});

test("PostgreSQL repository prevents deleting another user's comment", async () => {
  const repository = createPostgresCommentsRepository({
    async query() {
      return { rows: [{ author_id: "user_2" }] };
    },
  });

  await assert.rejects(
    repository.deleteById({ commentId: "comment_1", requesterId: "user_1" }),
    /Only the comment author can delete this comment/,
  );
});

test("comments handlers return REST responses and error envelopes", async () => {
  const handlers = createCommentsHandlers({
    commentsService: {
      async listComments() {
        return { comments: [commentRow({ id: "comment_1" })], nextCursor: null };
      },
      async createComment(input) {
        return commentRow({ id: "comment_2", content: input.content });
      },
      async deleteComment() {},
    },
  });

  const list = await handlers.handle({
    method: "GET",
    path: "/posts/post_1/comments?limit=10",
    requestId: "req_1",
  });
  assert.equal(list.status, 200);
  assert.equal(list.body.comments.length, 1);

  const created = await handlers.handle({
    method: "POST",
    path: "/posts/post_1/comments",
    user: { id: "user_1" },
    body: { content: "hello" },
    requestId: "req_2",
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.comment.content, "hello");

  const unauthenticated = await handlers.handle({
    method: "POST",
    path: "/posts/post_1/comments",
    body: { content: "hello" },
    requestId: "req_3",
  });
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.body.error.code, "UNAUTHENTICATED");
});

function commentRow({ id, content = "hello" }) {
  return {
    id,
    postId: "post_1",
    content,
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
    author: {
      id: "user_1",
      name: "Ada",
      avatarUrl: "",
    },
  };
}
