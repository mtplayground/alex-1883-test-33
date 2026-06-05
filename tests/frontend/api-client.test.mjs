import assert from "node:assert/strict";
import test from "node:test";
import {
  ApiClientError,
  createApiClient,
  createMemoryTokenStore,
} from "../../frontend/src/auth/api-client.mjs";

test("api client attaches JWT authorization and parses JSON responses", async () => {
  const requests = [];
  const client = createApiClient({
    baseUrl: "https://app.example.com/api/",
    tokenStore: createMemoryTokenStore("jwt-token"),
    fetchFn: async (url, init) => {
      requests.push({ url: String(url), init });
      return jsonResponse(200, { user: { id: "user_1" } });
    },
  });

  const result = await client.getCurrentUser();

  assert.deepEqual(result, { user: { id: "user_1" } });
  assert.equal(requests[0].url, "https://app.example.com/me");
  assert.equal(requests[0].init.headers.get("authorization"), "Bearer jwt-token");
});

test("api client sends JSON bodies for posts and auth callback", async () => {
  const requests = [];
  const client = createApiClient({
    tokenStore: createMemoryTokenStore("jwt-token"),
    fetchFn: async (url, init) => {
      requests.push({ url: String(url), init });
      return jsonResponse(201, { ok: true });
    },
  });

  await client.createPost({ imageUrl: "https://example.com/image.png", caption: "hello" });
  await client.completeGoogleSignIn({ code: "code_1", state: "nonce" });

  assert.equal(requests[0].url, "http://local/posts");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.headers.get("content-type"), "application/json");
  assert.equal(requests[0].init.body, JSON.stringify({ imageUrl: "https://example.com/image.png", caption: "hello" }));
  assert.equal(requests[1].url, "http://local/auth/google/callback");
  assert.equal(requests[1].init.body, JSON.stringify({ code: "code_1", state: "nonce" }));
});

test("api client maps feed, follow, like, and comment endpoints", async () => {
  const paths = [];
  const client = createApiClient({
    fetchFn: async (url, init) => {
      paths.push([String(url), init.method]);
      return jsonResponse(200, {});
    },
  });

  await client.listFeed({ cursor: "abc", limit: 10 });
  await client.followUser("user 2");
  await client.unfollowUser("user 2");
  await client.likePost("post 1");
  await client.unlikePost("post 1");
  await client.createComment("post 1", "hello");
  await client.deleteComment("comment 1");

  assert.deepEqual(paths, [
    ["http://local/feed?cursor=abc&limit=10", "GET"],
    ["http://local/users/user%202/follow", "POST"],
    ["http://local/users/user%202/follow", "DELETE"],
    ["http://local/posts/post%201/like", "POST"],
    ["http://local/posts/post%201/like", "DELETE"],
    ["http://local/posts/post%201/comments", "POST"],
    ["http://local/comments/comment%201", "DELETE"],
  ]);
});

test("api client lets fetch set multipart headers for image uploads", async () => {
  const requests = [];
  const client = createApiClient({
    fetchFn: async (url, init) => {
      requests.push({ url: String(url), init });
      return jsonResponse(201, { imageUrl: "https://example.com/upload.png" });
    },
  });

  const result = await client.uploadImage(new Blob(["image"], { type: "image/png" }));

  assert.equal(result.imageUrl, "https://example.com/upload.png");
  assert.equal(requests[0].url, "http://local/uploads/images");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.body instanceof FormData, true);
  assert.equal(requests[0].init.headers.has("content-type"), false);
});

test("api client throws structured errors from error envelopes", async () => {
  const client = createApiClient({
    fetchFn: async () =>
      jsonResponse(401, {
        error: {
          code: "UNAUTHENTICATED",
          message: "Authentication is required",
          details: { field: "authorization" },
        },
      }),
  });

  await assert.rejects(
    client.getCurrentUser(),
    (error) =>
      error instanceof ApiClientError &&
      error.status === 401 &&
      error.code === "UNAUTHENTICATED" &&
      error.details.field === "authorization",
  );
});

function jsonResponse(status, body) {
  return {
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}
