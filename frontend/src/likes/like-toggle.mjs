export function createLikeState({ postId, currentUser, isLiked = false, likeCount = 0 }) {
  if (!postId) {
    throw new Error("postId is required");
  }

  return {
    postId,
    currentUser: currentUser ?? null,
    isLiked: Boolean(isLiked),
    likeCount: normalizeLikeCount(likeCount),
    isSubmitting: false,
    errorMessage: "",
  };
}

export function getLikeView(state) {
  const isSignedIn = Boolean(state.currentUser);
  return {
    isSignedIn,
    isPressed: state.isLiked,
    isDisabled: !isSignedIn || state.isSubmitting,
    buttonLabel: state.isLiked ? "Unlike" : "Like",
    countLabel: formatLikeCount(state.likeCount),
    likeCount: state.likeCount,
    errorMessage: state.errorMessage,
  };
}

export function markLikeSubmitting(state) {
  return {
    ...state,
    isSubmitting: true,
    errorMessage: "",
  };
}

export function applyOptimisticLikeToggle(state) {
  const nextIsLiked = !state.isLiked;
  return {
    ...state,
    isLiked: nextIsLiked,
    likeCount: nextIsLiked ? state.likeCount + 1 : Math.max(0, state.likeCount - 1),
    isSubmitting: true,
    errorMessage: "",
  };
}

export function applyLikeResult(state, result = {}) {
  return {
    ...state,
    isLiked: readBoolean(result, ["isLiked", "liked", "data.isLiked", "data.liked"], state.isLiked),
    likeCount: normalizeLikeCount(readNumber(result, ["likeCount", "count", "data.likeCount", "data.count"], state.likeCount)),
    isSubmitting: false,
    errorMessage: "",
  };
}

export function failLikeToggle(previousState, error) {
  return {
    ...previousState,
    isSubmitting: false,
    errorMessage: toSafeErrorMessage(error),
  };
}

export function formatLikeCount(count) {
  const normalized = normalizeLikeCount(count);
  return `${normalized} ${normalized === 1 ? "like" : "likes"}`;
}

export function createLikeToggle({ postId, currentUser, isLiked = false, likeCount = 0, apiClient }) {
  if (!globalThis.document) {
    throw new Error("createLikeToggle requires a browser document");
  }
  if (!apiClient || typeof apiClient.likePost !== "function" || typeof apiClient.unlikePost !== "function") {
    throw new Error("apiClient.likePost and apiClient.unlikePost are required");
  }

  let state = createLikeState({ postId, currentUser, isLiked, likeCount });
  const root = document.createElement("div");
  root.className = "like-toggle";

  const button = document.createElement("button");
  button.className = "like-toggle__button";
  button.type = "button";

  const count = document.createElement("span");
  count.className = "like-toggle__count";

  const error = document.createElement("span");
  error.className = "like-toggle__error";
  error.setAttribute("role", "alert");

  root.append(button, count, error);

  button.addEventListener("click", async () => {
    const view = getLikeView(state);
    if (view.isDisabled) {
      return;
    }

    const previousState = state;
    state = applyOptimisticLikeToggle(state);
    render();

    try {
      const result = state.isLiked
        ? await apiClient.likePost(state.postId)
        : await apiClient.unlikePost(state.postId);
      state = applyLikeResult(state, result);
    } catch (caught) {
      state = failLikeToggle(previousState, caught);
    }
    render();
  });

  function render() {
    const view = getLikeView(state);
    button.disabled = view.isDisabled;
    button.setAttribute("aria-pressed", String(view.isPressed));
    button.setAttribute("aria-label", `${view.buttonLabel} post`);
    button.textContent = view.buttonLabel;
    count.textContent = view.countLabel;
    error.textContent = view.errorMessage;
    error.hidden = !view.errorMessage;
  }

  render();

  return {
    element: root,
    getState() {
      return state;
    },
    setState(nextState) {
      state = {
        ...state,
        ...nextState,
        likeCount: normalizeLikeCount(nextState.likeCount ?? state.likeCount),
      };
      render();
    },
  };
}

function normalizeLikeCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
}

function readNumber(value, paths, fallback) {
  for (const path of paths) {
    const candidate = getByPath(value, path);
    if (Number.isFinite(Number(candidate))) {
      return Number(candidate);
    }
  }
  return fallback;
}

function readBoolean(value, paths, fallback) {
  for (const path of paths) {
    const candidate = getByPath(value, path);
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

function toSafeErrorMessage(error) {
  if (error && typeof error === "object" && "message" in error && error.message) {
    return String(error.message);
  }
  return "Unable to update like. Please try again.";
}
