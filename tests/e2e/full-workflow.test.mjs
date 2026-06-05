import assert from "node:assert/strict";
import test from "node:test";

const REQUIRED_ENV = ["E2E_BASE_URL", "E2E_AUTH_TOKEN", "E2E_FOLLOW_USER_ID"];
const missingEnv = REQUIRED_ENV.filter((name) => !process.env[name]);

test(
  "login -> upload image -> create post -> follow -> feed -> like -> comment",
  { skip: missingEnv.length ? `missing ${missingEnv.join(", ")}` : false },
  async () => {
    const client = new E2eClient({
      baseUrl: process.env.E2E_BASE_URL,
      token: process.env.E2E_AUTH_TOKEN,
    });

    const me = await client.get("/me");
    const currentUserId = extractId(me, ["user", "me", "data"]);
    assert.ok(currentUserId, "authenticated /me response must include a user id");

    const targetUserId = process.env.E2E_FOLLOW_USER_ID;
    assert.notEqual(
      targetUserId,
      currentUserId,
      "E2E_FOLLOW_USER_ID must identify a different user than the authenticated user",
    );

    const upload = await client.uploadImage("/uploads/images", onePixelPngBlob(), "e2e-pixel.png");
    const imageUrl = extractString(upload, ["url", "imageUrl", "data.url", "data.imageUrl"]);
    assert.ok(imageUrl, "image upload response must include an image URL");

    const caption = `e2e workflow ${new Date().toISOString()}`;
    const post = await client.postJson("/posts", {
      imageUrl,
      caption,
    });
    const postId = extractId(post, ["post", "data"]);
    assert.ok(postId, "create post response must include a post id");

    await client.postJson(`/users/${encodeURIComponent(targetUserId)}/follow`, {});

    const feed = await client.get("/feed?limit=20");
    const feedItems = extractArray(feed, ["items", "posts", "data", "data.items", "data.posts"]);
    assert.ok(
      feedItems.some((item) => String(extractId(item, ["post", "data"]) ?? item.id) === String(postId)),
      "feed must include the newly created post",
    );

    await client.postJson(`/posts/${encodeURIComponent(postId)}/like`, {});
    const likes = await client.get(`/posts/${encodeURIComponent(postId)}/likes`);
    const likeCount = extractNumber(likes, ["count", "likeCount", "data.count", "data.likeCount"]);
    assert.ok(Number.isInteger(likeCount), "like count response must include an integer count");
    assert.ok(likeCount >= 1, "like count must include the E2E like");

    const commentText = `e2e comment ${new Date().toISOString()}`;
    const createdComment = await client.postJson(`/posts/${encodeURIComponent(postId)}/comments`, {
      content: commentText,
    });
    const commentId = extractId(createdComment, ["comment", "data"]);
    assert.ok(commentId, "create comment response must include a comment id");

    const comments = await client.get(`/posts/${encodeURIComponent(postId)}/comments`);
    const commentItems = extractArray(comments, ["comments", "items", "data", "data.comments", "data.items"]);
    assert.ok(
      commentItems.some((item) => item.content === commentText || item.text === commentText),
      "comment list must include the E2E comment",
    );

    await cleanup(client, { commentId, postId, targetUserId });
  },
);

class E2eClient {
  constructor({ baseUrl, token }) {
    this.baseUrl = new URL(baseUrl);
    this.token = token;
  }

  get(path) {
    return this.request("GET", path);
  }

  postJson(path, body) {
    return this.request("POST", path, {
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  delete(path) {
    return this.request("DELETE", path, {
      expectedStatuses: [200, 204, 404],
    });
  }

  uploadImage(path, blob, fileName) {
    const formData = new FormData();
    formData.append("image", blob, fileName);
    return this.request("POST", path, {
      body: formData,
    });
  }

  async request(method, path, options = {}) {
    const url = new URL(path, this.baseUrl);
    const headers = new Headers(options.headers ?? {});
    headers.set("authorization", `Bearer ${this.token}`);

    const response = await fetch(url, {
      method,
      headers,
      body: options.body,
    });

    const expectedStatuses = options.expectedStatuses ?? [200, 201];
    const responseText = await response.text();
    const parsed = parseResponseBody(responseText);

    if (!expectedStatuses.includes(response.status)) {
      throw new Error(
        `${method} ${url.pathname} returned ${response.status}: ${responseText.slice(0, 500)}`,
      );
    }

    return parsed;
  }
}

async function cleanup(client, { commentId, postId, targetUserId }) {
  const cleanupSteps = [
    () => client.delete(`/comments/${encodeURIComponent(commentId)}`),
    () => client.delete(`/posts/${encodeURIComponent(postId)}/like`),
    () => client.delete(`/users/${encodeURIComponent(targetUserId)}/follow`),
  ];

  const failures = [];
  for (const step of cleanupSteps) {
    try {
      await step();
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, "E2E cleanup failed");
  }
}

function parseResponseBody(text) {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function onePixelPngBlob() {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64",
  );
  return new Blob([png], { type: "image/png" });
}

function extractId(value, wrappers) {
  const direct = getByPath(value, "id") ?? getByPath(value, "_id");
  if (direct !== undefined) {
    return direct;
  }

  for (const wrapper of wrappers) {
    const candidate = getByPath(value, `${wrapper}.id`) ?? getByPath(value, `${wrapper}._id`);
    if (candidate !== undefined) {
      return candidate;
    }
  }

  return undefined;
}

function extractString(value, paths) {
  for (const path of paths) {
    const candidate = getByPath(value, path);
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return undefined;
}

function extractNumber(value, paths) {
  for (const path of paths) {
    const candidate = getByPath(value, path);
    if (Number.isInteger(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function extractArray(value, paths) {
  for (const path of paths) {
    const candidate = getByPath(value, path);
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }
  return [];
}

function getByPath(value, path) {
  return path.split(".").reduce((current, segment) => {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    return current[segment];
  }, value);
}
