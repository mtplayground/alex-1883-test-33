export const DEFAULT_FEED_LIMIT = 20;
export const MAX_FEED_LIMIT = 50;

export function createFeedState({ posts = [], nextCursor = null, hasNextPage = Boolean(nextCursor) } = {}) {
  return {
    posts: posts.map(normalizePost),
    nextCursor,
    hasNextPage,
    isLoading: false,
    errorMessage: "",
  };
}

export function getFeedView(state) {
  return {
    posts: state.posts.map((post) => ({
      ...post,
      displayTime: formatPostTimestamp(post.createdAt),
    })),
    isEmpty: state.posts.length === 0 && !state.isLoading,
    canLoadMore: state.hasNextPage && !state.isLoading,
    showLoading: state.isLoading,
    errorMessage: state.errorMessage,
  };
}

export function markFeedLoading(state) {
  return {
    ...state,
    isLoading: true,
    errorMessage: "",
  };
}

export function appendFeedPage(state, page) {
  const normalizedPage = normalizeFeedPage(page);
  const seen = new Set(state.posts.map((post) => String(post.id)));
  const nextPosts = [...state.posts];

  for (const post of normalizedPage.posts) {
    if (!seen.has(String(post.id))) {
      seen.add(String(post.id));
      nextPosts.push(post);
    }
  }

  return {
    ...state,
    posts: nextPosts,
    nextCursor: normalizedPage.nextCursor,
    hasNextPage: Boolean(normalizedPage.nextCursor),
    isLoading: false,
    errorMessage: "",
  };
}

export function prependFeedPost(state, post) {
  const normalized = normalizePost(post);
  const nextPosts = state.posts.filter((item) => String(item.id) !== String(normalized.id));

  return {
    ...state,
    posts: [normalized, ...nextPosts],
    errorMessage: "",
  };
}

export function failFeedLoad(state, error) {
  return {
    ...state,
    isLoading: false,
    errorMessage: toSafeErrorMessage(error),
  };
}

export function normalizeFeedPage(page = {}) {
  const posts = readArray(page, ["posts", "items", "data.posts", "data.items", "data"]);
  const nextCursor = readValue(page, ["nextCursor", "cursor", "data.nextCursor", "data.cursor"], null);

  return {
    posts: posts.map(normalizePost),
    nextCursor: nextCursor ? String(nextCursor) : null,
  };
}

export function createFeedPage({ apiClient, initialPosts = [], nextCursor = null, limit = DEFAULT_FEED_LIMIT }) {
  if (!globalThis.document) {
    throw new Error("createFeedPage requires a browser document");
  }
  if (!apiClient || typeof apiClient.listFeed !== "function") {
    throw new Error("apiClient.listFeed is required");
  }

  const pageLimit = normalizeLimit(limit);
  let state = createFeedState({ posts: initialPosts, nextCursor });

  const root = document.createElement("section");
  root.className = "feed-page";
  root.setAttribute("aria-label", "Feed");

  const list = document.createElement("div");
  list.className = "feed-page__list";

  const empty = document.createElement("p");
  empty.className = "feed-page__empty";
  empty.textContent = "No posts yet.";

  const error = document.createElement("p");
  error.className = "feed-page__error";
  error.setAttribute("role", "alert");

  const loadMore = document.createElement("button");
  loadMore.className = "feed-page__load-more";
  loadMore.type = "button";
  loadMore.textContent = "Load more";

  const sentinel = document.createElement("div");
  sentinel.className = "feed-page__sentinel";
  sentinel.setAttribute("aria-hidden", "true");

  root.append(list, empty, error, loadMore, sentinel);

  loadMore.addEventListener("click", () => {
    void loadNextPage();
  });

  let observer = null;
  if (typeof IntersectionObserver === "function") {
    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadNextPage();
      }
    });
    observer.observe(sentinel);
  }

  async function loadNextPage() {
    const view = getFeedView(state);
    if (!view.canLoadMore && state.posts.length > 0) {
      return;
    }

    state = markFeedLoading(state);
    render();

    try {
      const page = await apiClient.listFeed({
        cursor: state.nextCursor,
        limit: pageLimit,
      });
      state = appendFeedPage(state, page);
    } catch (caught) {
      state = failFeedLoad(state, caught);
    }
    render();
  }

  function render() {
    const view = getFeedView(state);
    list.replaceChildren(...view.posts.map(renderPostCard));
    empty.hidden = !view.isEmpty;
    error.textContent = view.errorMessage;
    error.hidden = !view.errorMessage;
    loadMore.disabled = !view.canLoadMore;
    loadMore.hidden = !state.hasNextPage && state.posts.length > 0;
    loadMore.textContent = view.showLoading ? "Loading..." : "Load more";
  }

  render();

  return {
    element: root,
    getState() {
      return state;
    },
    loadNextPage,
    prependPost(post) {
      state = prependFeedPost(state, post);
      render();
    },
    disconnect() {
      if (observer) {
        observer.disconnect();
      }
    },
  };
}

function renderPostCard(post) {
  const link = document.createElement("a");
  link.className = "feed-card-link";
  link.href = `/post/${encodeURIComponent(post.id)}`;
  link.setAttribute("aria-label", `Open post by ${post.author.name}`);

  const article = document.createElement("article");
  article.className = "feed-card";
  article.dataset.postId = String(post.id);

  const image = document.createElement("img");
  image.className = "feed-card__image";
  image.alt = post.caption || "Post image";
  image.loading = "lazy";
  image.src = post.imageUrl;

  const body = document.createElement("div");
  body.className = "feed-card__body";

  const header = document.createElement("div");
  header.className = "feed-card__header";

  const author = document.createElement("span");
  author.className = "feed-card__author";
  author.textContent = post.author.name;

  const time = document.createElement("time");
  time.className = "feed-card__time";
  time.dateTime = post.createdAt;
  time.textContent = post.displayTime;

  const caption = document.createElement("p");
  caption.className = "feed-card__caption";
  caption.textContent = post.caption;

  header.append(author, time);
  body.append(header, caption);
  article.append(image, body);
  link.append(article);
  return link;
}

function normalizePost(post) {
  if (!post || post.id === undefined || post.id === null) {
    throw new Error("post.id is required");
  }
  if (!post.imageUrl) {
    throw new Error("post.imageUrl is required");
  }

  const author = post.author ?? {};
  if (author.id === undefined || author.id === null) {
    throw new Error("post.author.id is required");
  }

  return {
    id: post.id,
    imageUrl: String(post.imageUrl),
    caption: String(post.caption ?? ""),
    createdAt: normalizeDate(post.createdAt),
    author: {
      id: author.id,
      name: String(author.name || "Unknown user"),
      avatarUrl: author.avatarUrl ? String(author.avatarUrl) : "",
    },
  };
}

function normalizeLimit(limit) {
  const parsed = Number(limit);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_FEED_LIMIT;
  }
  return Math.min(parsed, MAX_FEED_LIMIT);
}

function normalizeDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error("post.createdAt must be a valid date");
  }
  return date.toISOString();
}

function formatPostTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function readArray(value, paths) {
  for (const path of paths) {
    const candidate = readValue(value, [path], undefined);
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }
  return [];
}

function readValue(value, paths, fallback) {
  for (const path of paths) {
    const candidate = getByPath(value, path);
    if (candidate !== undefined && candidate !== null) {
      return candidate;
    }
  }
  return fallback;
}

function getByPath(value, path) {
  return path.split(".").reduce((current, segment) => {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    return current[segment];
  }, value);
}

function toSafeErrorMessage(error) {
  if (error && typeof error === "object" && "message" in error && error.message) {
    return String(error.message);
  }
  return "Unable to load feed. Please try again.";
}
