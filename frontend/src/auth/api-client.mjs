export class ApiClientError extends Error {
  constructor(message, { status, code, details, response } = {}) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.response = response;
  }
}

export function createApiClient({ baseUrl = "/", tokenStore, fetchFn = globalThis.fetch } = {}) {
  if (typeof fetchFn !== "function") {
    throw new Error("fetch is required");
  }

  const client = {
    request(path, options = {}) {
      return requestJson({
        baseUrl,
        tokenStore,
        fetchFn,
        path,
        ...options,
      });
    },
    getCurrentUser() {
      return client.request("/me");
    },
    completeGoogleSignIn({ code, state }) {
      return client.request("/auth/google/callback", {
        method: "POST",
        body: { code, state },
      });
    },
    uploadImage(file) {
      const formData = new FormData();
      formData.append("image", file);
      return client.request("/uploads/images", {
        method: "POST",
        body: formData,
      });
    },
    createPost({ imageUrl, caption = "" }) {
      return client.request("/posts", {
        method: "POST",
        body: { imageUrl, caption },
      });
    },
    listFeed({ cursor, limit } = {}) {
      const params = new URLSearchParams();
      if (cursor) {
        params.set("cursor", cursor);
      }
      if (limit !== undefined) {
        params.set("limit", String(limit));
      }
      return client.request(`/feed${params.size ? `?${params.toString()}` : ""}`);
    },
    followUser(userId) {
      return client.request(`/users/${encodeURIComponent(userId)}/follow`, {
        method: "POST",
        body: {},
      });
    },
    unfollowUser(userId) {
      return client.request(`/users/${encodeURIComponent(userId)}/follow`, {
        method: "DELETE",
      });
    },
    likePost(postId) {
      return client.request(`/posts/${encodeURIComponent(postId)}/like`, {
        method: "POST",
        body: {},
      });
    },
    unlikePost(postId) {
      return client.request(`/posts/${encodeURIComponent(postId)}/like`, {
        method: "DELETE",
      });
    },
    createComment(postId, content) {
      return client.request(`/posts/${encodeURIComponent(postId)}/comments`, {
        method: "POST",
        body: { content },
      });
    },
    deleteComment(commentId) {
      return client.request(`/comments/${encodeURIComponent(commentId)}`, {
        method: "DELETE",
      });
    },
  };

  return client;
}

export function createMemoryTokenStore(initialToken = "") {
  let token = initialToken ? String(initialToken) : "";
  return {
    getToken() {
      return token;
    },
    saveToken(nextToken) {
      token = nextToken ? String(nextToken) : "";
    },
    clearToken() {
      token = "";
    },
  };
}

export function createLocalStorageTokenStore({
  storage = globalThis.localStorage,
  key = "auth_token",
} = {}) {
  if (!storage) {
    return createMemoryTokenStore();
  }

  return {
    getToken() {
      return storage.getItem(key) || "";
    },
    saveToken(token) {
      storage.setItem(key, String(token || ""));
    },
    clearToken() {
      storage.removeItem(key);
    },
  };
}

async function requestJson({
  baseUrl,
  tokenStore,
  fetchFn,
  path,
  method = "GET",
  body,
  headers = {},
  expectedStatuses = [200, 201, 204],
}) {
  const url = new URL(String(path), normalizeBaseUrl(baseUrl));
  const requestHeaders = new Headers(headers);
  const token = tokenStore?.getToken?.();
  if (token) {
    requestHeaders.set("authorization", `Bearer ${token}`);
  }

  let requestBody = body;
  if (body !== undefined && isPlainJsonBody(body)) {
    requestHeaders.set("content-type", "application/json");
    requestBody = JSON.stringify(body);
  }

  const response = await fetchFn(url, {
    method,
    headers: requestHeaders,
    body: requestBody,
  });
  const text = await response.text();
  const parsed = parseResponseBody(text);

  if (!expectedStatuses.includes(response.status)) {
    throw createApiClientError(response, parsed);
  }

  return parsed;
}

function normalizeBaseUrl(baseUrl) {
  return new URL(String(baseUrl || "/"), "http://local");
}

function isPlainJsonBody(body) {
  return typeof body === "object" && body !== null && !(body instanceof FormData) && !(body instanceof Blob);
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

function createApiClientError(response, parsed) {
  const envelope = parsed?.error ?? parsed?.data?.error ?? {};
  return new ApiClientError(envelope.message || `Request failed with status ${response.status}`, {
    status: response.status,
    code: envelope.code,
    details: envelope.details,
    response: parsed,
  });
}
