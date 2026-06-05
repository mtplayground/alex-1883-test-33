export function createFollowState({
  targetUser,
  currentUser,
  isFollowing = false,
  followerCount = 0,
  followingCount = 0,
}) {
  if (!targetUser?.id) {
    throw new Error("targetUser.id is required");
  }

  return {
    targetUser: {
      id: targetUser.id,
      name: String(targetUser.name || "User"),
      avatarUrl: targetUser.avatarUrl ? String(targetUser.avatarUrl) : "",
    },
    currentUser: currentUser ?? null,
    isFollowing: Boolean(isFollowing),
    followerCount: normalizeCount(followerCount),
    followingCount: normalizeCount(followingCount),
    isSubmitting: false,
    errorMessage: "",
  };
}

export function getFollowView(state) {
  const isSignedIn = Boolean(state.currentUser);
  const isSelf = isSignedIn && String(state.currentUser.id) === String(state.targetUser.id);

  return {
    isSignedIn,
    isSelf,
    isPressed: state.isFollowing,
    isDisabled: !isSignedIn || isSelf || state.isSubmitting,
    buttonLabel: state.isFollowing ? "Unfollow" : "Follow",
    followerCountLabel: formatFollowerCount(state.followerCount),
    followingCountLabel: formatFollowingCount(state.followingCount),
    followerCount: state.followerCount,
    followingCount: state.followingCount,
    targetName: state.targetUser.name,
    errorMessage: state.errorMessage,
  };
}

export function markFollowSubmitting(state) {
  return {
    ...state,
    isSubmitting: true,
    errorMessage: "",
  };
}

export function applyOptimisticFollowToggle(state) {
  const nextIsFollowing = !state.isFollowing;
  return {
    ...state,
    isFollowing: nextIsFollowing,
    followerCount: nextIsFollowing ? state.followerCount + 1 : Math.max(0, state.followerCount - 1),
    isSubmitting: true,
    errorMessage: "",
  };
}

export function applyFollowResult(state, result = {}) {
  return {
    ...state,
    isFollowing: readBoolean(result, ["isFollowing", "following", "data.isFollowing", "data.following"], state.isFollowing),
    followerCount: normalizeCount(
      readNumber(
        result,
        ["followerCount", "followersCount", "followers", "count", "data.followerCount", "data.followersCount", "data.count"],
        state.followerCount,
      ),
    ),
    followingCount: normalizeCount(
      readNumber(result, ["followingCount", "following", "data.followingCount"], state.followingCount),
    ),
    isSubmitting: false,
    errorMessage: "",
  };
}

export function failFollowToggle(previousState, error) {
  return {
    ...previousState,
    isSubmitting: false,
    errorMessage: toSafeErrorMessage(error),
  };
}

export function formatFollowerCount(count) {
  const normalized = normalizeCount(count);
  return `${normalized} ${normalized === 1 ? "follower" : "followers"}`;
}

export function formatFollowingCount(count) {
  const normalized = normalizeCount(count);
  return `${normalized} following`;
}

export function createFollowToggle({
  targetUser,
  currentUser,
  isFollowing = false,
  followerCount = 0,
  followingCount = 0,
  apiClient,
}) {
  if (!globalThis.document) {
    throw new Error("createFollowToggle requires a browser document");
  }
  if (!apiClient || typeof apiClient.followUser !== "function" || typeof apiClient.unfollowUser !== "function") {
    throw new Error("apiClient.followUser and apiClient.unfollowUser are required");
  }

  let state = createFollowState({
    targetUser,
    currentUser,
    isFollowing,
    followerCount,
    followingCount,
  });

  const root = document.createElement("div");
  root.className = "follow-toggle";

  const button = document.createElement("button");
  button.className = "follow-toggle__button";
  button.type = "button";

  const counts = document.createElement("span");
  counts.className = "follow-toggle__counts";

  const error = document.createElement("span");
  error.className = "follow-toggle__error";
  error.setAttribute("role", "alert");

  root.append(button, counts, error);

  button.addEventListener("click", async () => {
    const view = getFollowView(state);
    if (view.isDisabled) {
      return;
    }

    const previousState = state;
    state = applyOptimisticFollowToggle(state);
    render();

    try {
      const result = state.isFollowing
        ? await apiClient.followUser(state.targetUser.id)
        : await apiClient.unfollowUser(state.targetUser.id);
      state = applyFollowResult(state, result);
    } catch (caught) {
      state = failFollowToggle(previousState, caught);
    }
    render();
  });

  function render() {
    const view = getFollowView(state);
    button.disabled = view.isDisabled;
    button.setAttribute("aria-pressed", String(view.isPressed));
    button.setAttribute("aria-label", `${view.buttonLabel} ${view.targetName}`);
    button.textContent = view.isSelf ? "You" : view.buttonLabel;
    counts.textContent = `${view.followerCountLabel} · ${view.followingCountLabel}`;
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
        followerCount: normalizeCount(nextState.followerCount ?? state.followerCount),
        followingCount: normalizeCount(nextState.followingCount ?? state.followingCount),
      };
      render();
    },
  };
}

function normalizeCount(value) {
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
  return "Unable to update follow status. Please try again.";
}
