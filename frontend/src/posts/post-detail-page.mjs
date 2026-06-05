import { createCommentThread } from "../comments/comment-thread.mjs";
import { createFollowToggle } from "../follows/follow-toggle.mjs";
import { createLikeToggle } from "../likes/like-toggle.mjs";
import { createPostCard, normalizePostCard } from "./post-card.mjs";

export function createPostDetailState({ postId, currentUser, postDetail = null } = {}) {
  if (!postId) {
    throw new Error("postId is required");
  }

  return {
    postId: String(postId),
    currentUser: currentUser ?? null,
    postDetail: postDetail ? normalizePostDetail(postDetail) : null,
    isLoading: false,
    errorMessage: "",
  };
}

export function getPostDetailView(state) {
  return {
    isLoading: state.isLoading,
    hasPost: Boolean(state.postDetail),
    errorMessage: state.errorMessage,
    post: state.postDetail?.post ?? null,
    author: state.postDetail?.post.author ?? null,
    comments: state.postDetail?.comments ?? [],
    likeCount: state.postDetail?.likeCount ?? 0,
    isLiked: state.postDetail?.isLiked ?? false,
    followerCount: state.postDetail?.followerCount ?? 0,
    followingCount: state.postDetail?.followingCount ?? 0,
    isFollowing: state.postDetail?.isFollowing ?? false,
  };
}

export function normalizePostDetail(payload) {
  const source = readValue(payload, ["post", "data.post", "data", "item"], payload);
  const post = normalizePostCard(source);
  const comments = readArray(payload, ["comments", "post.comments", "data.comments", "data.post.comments"]);
  const authorStats = readValue(
    payload,
    ["authorStats", "post.authorStats", "data.authorStats", "data.post.authorStats"],
    {},
  );
  const followState = readValue(payload, ["follow", "followState", "data.follow", "data.followState"], {});
  const likeState = readValue(payload, ["like", "likeState", "data.like", "data.likeState"], {});

  return {
    post,
    comments,
    likeCount: normalizeCount(
      readNumber(
        payload,
        ["likeCount", "post.likeCount", "data.likeCount", "data.post.likeCount"],
        likeState.count ?? 0,
      ),
    ),
    isLiked: readBoolean(
      payload,
      ["isLiked", "post.isLiked", "data.isLiked", "data.post.isLiked"],
      likeState.isLiked ?? false,
    ),
    followerCount: normalizeCount(
      readNumber(
        authorStats,
        ["followerCount", "followersCount", "followers", "count"],
        readNumber(
          payload,
          ["followerCount", "post.followerCount", "data.followerCount", "data.post.followerCount"],
          0,
        ),
      ),
    ),
    followingCount: normalizeCount(
      readNumber(
        authorStats,
        ["followingCount", "following"],
        readNumber(
          payload,
          ["followingCount", "post.followingCount", "data.followingCount", "data.post.followingCount"],
          0,
        ),
      ),
    ),
    isFollowing: readBoolean(
      followState,
      ["isFollowing", "following"],
      readBoolean(payload, ["isFollowing", "post.isFollowing", "data.isFollowing", "data.post.isFollowing"], false),
    ),
  };
}

export function createPostDetailPage({ postId, currentUser, apiClient, initialPostDetail = null }) {
  if (!globalThis.document) {
    throw new Error("createPostDetailPage requires a browser document");
  }
  if (!apiClient || typeof apiClient.getPost !== "function") {
    throw new Error("apiClient.getPost is required");
  }

  let state = createPostDetailState({ postId, currentUser, postDetail: initialPostDetail });
  let activeRequest = 0;

  const root = document.createElement("section");
  root.className = "post-detail-page";
  root.setAttribute("aria-label", "Post detail");

  const status = document.createElement("p");
  status.className = "post-detail-page__status";
  status.setAttribute("role", "status");

  const error = document.createElement("p");
  error.className = "post-detail-page__error";
  error.setAttribute("role", "alert");

  const content = document.createElement("div");
  content.className = "post-detail-page__content";

  root.append(status, error, content);

  async function loadPost() {
    const requestId = activeRequest + 1;
    activeRequest = requestId;
    state = markPostDetailLoading(state);
    render();

    try {
      const result = await apiClient.getPost(state.postId);
      if (requestId !== activeRequest) {
        return;
      }
      state = applyPostDetailResult(state, result);
    } catch (caught) {
      if (requestId !== activeRequest) {
        return;
      }
      state = failPostDetailLoad(state, caught);
    }
    render();
  }

  function render() {
    const view = getPostDetailView(state);
    status.textContent = view.isLoading ? "Loading post..." : "";
    status.hidden = !view.isLoading;
    error.textContent = view.errorMessage;
    error.hidden = !view.errorMessage;

    if (!view.hasPost) {
      content.replaceChildren();
      return;
    }

    const controls = document.createElement("div");
    controls.className = "post-detail-page__controls";
    controls.append(
      createFollowToggle({
        targetUser: view.author,
        currentUser: state.currentUser,
        isFollowing: view.isFollowing,
        followerCount: view.followerCount,
        followingCount: view.followingCount,
        apiClient,
      }).element,
      createLikeToggle({
        postId: view.post.id,
        currentUser: state.currentUser,
        isLiked: view.isLiked,
        likeCount: view.likeCount,
        apiClient,
      }).element,
    );

    const comments = document.createElement("section");
    comments.className = "post-detail-page__comments";
    const commentsTitle = document.createElement("h2");
    commentsTitle.textContent = "Comments";
    comments.append(
      commentsTitle,
      createCommentThread({
        postId: view.post.id,
        currentUser: state.currentUser,
        comments: view.comments,
        apiClient,
      }).element,
    );

    content.replaceChildren(createPostCard({ post: view.post }), controls, comments);
  }

  render();
  if (!state.postDetail) {
    void loadPost();
  }

  return {
    element: root,
    getState() {
      return state;
    },
    loadPost,
    setPostDetail(nextPostDetail) {
      state = applyPostDetailResult(state, nextPostDetail);
      render();
    },
    disconnect() {
      activeRequest += 1;
    },
  };
}

function markPostDetailLoading(state) {
  return {
    ...state,
    isLoading: true,
    errorMessage: "",
  };
}

function applyPostDetailResult(state, result) {
  return {
    ...state,
    postDetail: normalizePostDetail(result),
    isLoading: false,
    errorMessage: "",
  };
}

function failPostDetailLoad(state, error) {
  return {
    ...state,
    isLoading: false,
    errorMessage: toSafeErrorMessage(error),
  };
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

function readNumber(value, paths, fallback) {
  for (const path of paths) {
    const candidate = readValue(value, [path], undefined);
    if (Number.isFinite(Number(candidate))) {
      return Number(candidate);
    }
  }
  return fallback;
}

function readBoolean(value, paths, fallback) {
  for (const path of paths) {
    const candidate = readValue(value, [path], undefined);
    if (typeof candidate === "boolean") {
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

function normalizeCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
}

function toSafeErrorMessage(error) {
  if (error && typeof error === "object" && "message" in error && error.message) {
    return String(error.message);
  }
  return "Unable to load post. Please try again.";
}
