export function createProfilePageState({ currentUser = null, status = "idle", errorMessage = "" } = {}) {
  const normalizedUser = currentUser ? normalizeProfileUser(currentUser) : null;
  return {
    currentUser: normalizedUser,
    status: normalizedUser ? "signed-in" : normalizeStatus(status),
    errorMessage: errorMessage ? String(errorMessage) : "",
  };
}

export function getProfilePageView(state) {
  const status = normalizeStatus(state.status);
  const user = state.currentUser ? normalizeProfileUser(state.currentUser) : null;
  const isSignedIn = status === "signed-in" && Boolean(user);

  return {
    status,
    isLoading: status === "loading",
    isSignedIn,
    isSignedOut: status === "signed-out",
    hasError: status === "error",
    displayName: isSignedIn ? user.displayName : "",
    nickname: isSignedIn ? user.nickname : "",
    email: isSignedIn ? user.email : "",
    avatarUrl: isSignedIn ? user.avatarUrl : "",
    avatarInitials: isSignedIn ? initialsFor(user.displayName || user.nickname || user.email) : "",
    errorMessage: status === "error" ? state.errorMessage || "Unable to load profile." : "",
  };
}

export function setProfileLoading(state) {
  return {
    ...state,
    status: "loading",
    errorMessage: "",
  };
}

export function setProfileUser(state, currentUser) {
  return {
    ...state,
    currentUser: normalizeProfileUser(currentUser),
    status: "signed-in",
    errorMessage: "",
  };
}

export function setProfileSignedOut(state) {
  return {
    ...state,
    currentUser: null,
    status: "signed-out",
    errorMessage: "",
  };
}

export function setProfileError(state, error) {
  return {
    ...state,
    status: "error",
    errorMessage: toSafeErrorMessage(error),
  };
}

export async function loadProfile(state, apiClient) {
  if (!apiClient || typeof apiClient.getCurrentUser !== "function") {
    throw new Error("apiClient.getCurrentUser is required");
  }

  try {
    const result = await apiClient.getCurrentUser();
    const user = readObject(result, ["user", "currentUser", "data.user", "data.currentUser", "data", ""]);
    if (!user) {
      return setProfileSignedOut(state);
    }
    return setProfileUser(state, user);
  } catch (caught) {
    if (isUnauthenticatedError(caught)) {
      return setProfileSignedOut(state);
    }
    return setProfileError(state, caught);
  }
}

export function createProfilePage({ currentUser = null, apiClient } = {}) {
  if (!globalThis.document) {
    throw new Error("createProfilePage requires a browser document");
  }

  let state = createProfilePageState({ currentUser, status: currentUser ? "signed-in" : "loading" });

  const root = document.createElement("section");
  root.className = "profile-page";
  root.setAttribute("aria-label", "Profile");

  const avatarWrap = document.createElement("div");
  avatarWrap.className = "profile-page__avatar-wrap";

  const avatar = document.createElement("img");
  avatar.className = "profile-page__avatar";
  avatar.alt = "";
  avatar.loading = "lazy";

  const initials = document.createElement("span");
  initials.className = "profile-page__initials";
  initials.setAttribute("aria-hidden", "true");

  const body = document.createElement("div");
  body.className = "profile-page__body";

  const title = document.createElement("h1");
  title.className = "profile-page__name";

  const nickname = document.createElement("p");
  nickname.className = "profile-page__nickname";

  const email = document.createElement("p");
  email.className = "profile-page__email";

  const status = document.createElement("p");
  status.className = "profile-page__status";
  status.setAttribute("role", "status");

  const error = document.createElement("p");
  error.className = "profile-page__error";
  error.setAttribute("role", "alert");

  const retry = document.createElement("button");
  retry.className = "profile-page__retry";
  retry.type = "button";
  retry.textContent = "Retry";

  avatarWrap.append(avatar, initials);
  body.append(title, nickname, email, status, error, retry);
  root.append(avatarWrap, body);

  retry.addEventListener("click", async () => {
    if (!apiClient) {
      return;
    }
    state = setProfileLoading(state);
    render();
    state = await loadProfile(state, apiClient);
    render();
  });

  async function refresh() {
    if (!apiClient) {
      render();
      return state;
    }
    state = setProfileLoading(state);
    render();
    state = await loadProfile(state, apiClient);
    render();
    return state;
  }

  function render() {
    const view = getProfilePageView(state);
    root.dataset.state = view.status;

    avatar.hidden = !view.isSignedIn || !view.avatarUrl;
    avatar.src = view.avatarUrl;
    initials.hidden = !view.isSignedIn || Boolean(view.avatarUrl);
    initials.textContent = view.avatarInitials;

    title.textContent = view.isSignedIn ? view.displayName : "";
    title.hidden = !view.isSignedIn;
    nickname.textContent = view.nickname;
    nickname.hidden = !view.isSignedIn || !view.nickname;
    email.textContent = view.email;
    email.hidden = !view.isSignedIn || !view.email;

    status.textContent = view.isLoading ? "Loading profile" : view.isSignedOut ? "Signed out" : "";
    status.hidden = !view.isLoading && !view.isSignedOut;
    error.textContent = view.errorMessage;
    error.hidden = !view.hasError;
    retry.hidden = !view.hasError;
  }

  render();

  return {
    element: root,
    getState() {
      return state;
    },
    setState(nextState) {
      state = createProfilePageState(nextState);
      render();
    },
    refresh,
  };
}

export function normalizeProfileUser(user) {
  if (!user || user.id === undefined || user.id === null || String(user.id).trim() === "") {
    throw new Error("user.id is required");
  }

  const displayName = firstString(user.name, user.displayName, user.fullName, user.email, "Unknown user");
  return {
    id: user.id,
    displayName,
    nickname: firstString(user.nickname, user.username, user.handle, ""),
    email: firstString(user.email, ""),
    avatarUrl: firstString(user.avatarUrl, user.picture, user.imageUrl, ""),
  };
}

function normalizeStatus(status) {
  const normalized = String(status || "idle");
  if (["idle", "loading", "signed-out", "signed-in", "error"].includes(normalized)) {
    return normalized;
  }
  return "idle";
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function initialsFor(value) {
  const words = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return "U";
  }
  return words
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

function readObject(value, paths) {
  for (const path of paths) {
    const candidate = path ? getByPath(value, path) : value;
    if (candidate && typeof candidate === "object") {
      return candidate;
    }
  }
  return null;
}

function getByPath(value, path) {
  return path.split(".").reduce((current, segment) => {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    return current[segment];
  }, value);
}

function isUnauthenticatedError(error) {
  return error?.status === 401 || error?.code === "UNAUTHENTICATED" || error?.body?.error?.code === "UNAUTHENTICATED";
}

function toSafeErrorMessage(error) {
  if (error && typeof error === "object" && "message" in error && error.message) {
    return String(error.message);
  }
  return "Unable to load profile.";
}
