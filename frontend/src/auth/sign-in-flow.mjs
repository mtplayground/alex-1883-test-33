import { normalizeProfileUser } from "./profile-page.mjs";

export function createTopBarAuthState({
  currentUser = null,
  status = "signed-out",
  signInUrl = "/auth/google",
  profileUrl = "/profile",
} = {}) {
  const normalizedUser = currentUser ? normalizeProfileUser(currentUser) : null;
  return {
    currentUser: normalizedUser,
    status: normalizedUser ? "signed-in" : normalizeAuthStatus(status),
    signInUrl: String(signInUrl || "/auth/google"),
    profileUrl: String(profileUrl || "/profile"),
  };
}

export function getTopBarAuthView(state) {
  const status = normalizeAuthStatus(state.status);
  const user = state.currentUser ? normalizeProfileUser(state.currentUser) : null;
  const isSignedIn = status === "signed-in" && Boolean(user);

  return {
    status,
    isLoading: status === "loading",
    isSignedIn,
    isSignedOut: status === "signed-out",
    signInUrl: state.signInUrl || "/auth/google",
    profileUrl: state.profileUrl || "/profile",
    buttonLabel: isSignedIn ? "Profile" : "Sign in",
    displayName: isSignedIn ? user.displayName : "",
    avatarUrl: isSignedIn ? user.avatarUrl : "",
  };
}

export function createTopBarAuth({ currentUser = null, status = "signed-out", signInUrl, profileUrl } = {}) {
  if (!globalThis.document) {
    throw new Error("createTopBarAuth requires a browser document");
  }

  let state = createTopBarAuthState({ currentUser, status, signInUrl, profileUrl });

  const nav = document.createElement("nav");
  nav.className = "topbar-auth";
  nav.setAttribute("aria-label", "Account");

  const link = document.createElement("a");
  link.className = "topbar-auth__link";

  const avatar = document.createElement("img");
  avatar.className = "topbar-auth__avatar";
  avatar.alt = "";
  avatar.loading = "lazy";

  const label = document.createElement("span");
  label.className = "topbar-auth__label";

  nav.append(link);
  link.append(avatar, label);

  function render() {
    const view = getTopBarAuthView(state);
    nav.dataset.state = view.status;
    link.href = view.isSignedIn ? view.profileUrl : view.signInUrl;
    link.setAttribute("aria-disabled", String(view.isLoading));
    link.tabIndex = view.isLoading ? -1 : 0;
    avatar.hidden = !view.isSignedIn || !view.avatarUrl;
    avatar.src = view.avatarUrl;
    label.textContent = view.isLoading ? "Loading" : view.buttonLabel;
  }

  render();

  return {
    element: nav,
    getState() {
      return state;
    },
    setState(nextState) {
      state = createTopBarAuthState({
        ...state,
        ...nextState,
      });
      render();
    },
  };
}

export function parseAuthCallbackUrl(urlLike) {
  const url = new URL(String(urlLike || ""), "http://local");
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const error = url.searchParams.get("error") || "";
  const errorDescription = url.searchParams.get("error_description") || "";

  return {
    code,
    state,
    error,
    errorDescription,
    hasCode: Boolean(code),
    hasOAuthError: Boolean(error),
  };
}

export function createAuthCallbackState({
  status = "idle",
  code = "",
  state = "",
  errorMessage = "",
  redirectTo = "/",
  token = "",
  currentUser = null,
} = {}) {
  return {
    status: normalizeCallbackStatus(status),
    code: String(code || ""),
    state: String(state || ""),
    errorMessage: errorMessage ? String(errorMessage) : "",
    redirectTo: String(redirectTo || "/"),
    token: token ? String(token) : "",
    currentUser: currentUser ? normalizeProfileUser(currentUser) : null,
  };
}

export function getAuthCallbackView(state) {
  const status = normalizeCallbackStatus(state.status);
  return {
    status,
    isLoading: status === "loading",
    isSuccess: status === "success",
    hasError: status === "error",
    errorMessage: status === "error" ? state.errorMessage || "Unable to complete sign in." : "",
    redirectTo: state.redirectTo || "/",
    currentUser: state.currentUser,
  };
}

export async function resolveAuthCallback({ url, apiClient, tokenStore, redirectTo = "/" } = {}) {
  if (!apiClient || typeof apiClient.completeGoogleSignIn !== "function") {
    throw new Error("apiClient.completeGoogleSignIn is required");
  }

  const parsed = parseAuthCallbackUrl(url);
  if (parsed.hasOAuthError) {
    return createAuthCallbackState({
      status: "error",
      errorMessage: parsed.errorDescription || parsed.error,
      redirectTo,
    });
  }
  if (!parsed.hasCode) {
    return createAuthCallbackState({
      status: "error",
      errorMessage: "Missing Google authorization code.",
      redirectTo,
    });
  }

  try {
    const result = await apiClient.completeGoogleSignIn({
      code: parsed.code,
      state: parsed.state,
    });
    const token = readString(result, ["token", "accessToken", "jwt", "data.token", "data.accessToken", "data.jwt"]);
    if (token && tokenStore && typeof tokenStore.saveToken === "function") {
      tokenStore.saveToken(token);
    }
    return createAuthCallbackState({
      status: "success",
      code: parsed.code,
      state: parsed.state,
      redirectTo: readString(result, ["redirectTo", "data.redirectTo"], redirectTo) || redirectTo,
      token,
      currentUser: readObject(result, ["user", "currentUser", "data.user", "data.currentUser"]),
    });
  } catch (caught) {
    return createAuthCallbackState({
      status: "error",
      code: parsed.code,
      state: parsed.state,
      errorMessage: toSafeErrorMessage(caught),
      redirectTo,
    });
  }
}

export function createAuthCallbackPage({ url = globalThis.location?.href ?? "", apiClient, tokenStore, redirectTo = "/" } = {}) {
  if (!globalThis.document) {
    throw new Error("createAuthCallbackPage requires a browser document");
  }

  let state = createAuthCallbackState({ status: "loading", redirectTo });

  const root = document.createElement("section");
  root.className = "auth-callback";
  root.setAttribute("aria-label", "Sign in callback");

  const message = document.createElement("p");
  message.className = "auth-callback__message";
  message.setAttribute("role", "status");

  const error = document.createElement("p");
  error.className = "auth-callback__error";
  error.setAttribute("role", "alert");

  const retry = document.createElement("a");
  retry.className = "auth-callback__retry";
  retry.href = "/auth/google";
  retry.textContent = "Sign in";

  root.append(message, error, retry);

  async function complete() {
    state = createAuthCallbackState({ ...state, status: "loading" });
    render();
    state = await resolveAuthCallback({ url, apiClient, tokenStore, redirectTo });
    render();
    return state;
  }

  function render() {
    const view = getAuthCallbackView(state);
    root.dataset.state = view.status;
    message.textContent = view.isLoading ? "Completing sign in" : view.isSuccess ? "Signed in" : "";
    message.hidden = !view.isLoading && !view.isSuccess;
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
      state = createAuthCallbackState(nextState);
      render();
    },
    complete,
  };
}

function normalizeAuthStatus(status) {
  const normalized = String(status || "signed-out");
  if (["loading", "signed-out", "signed-in"].includes(normalized)) {
    return normalized;
  }
  return "signed-out";
}

function normalizeCallbackStatus(status) {
  const normalized = String(status || "idle");
  if (["idle", "loading", "success", "error"].includes(normalized)) {
    return normalized;
  }
  return "idle";
}

function readString(value, paths, fallback = "") {
  for (const path of paths) {
    const candidate = getByPath(value, path);
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return fallback;
}

function readObject(value, paths) {
  for (const path of paths) {
    const candidate = getByPath(value, path);
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

function toSafeErrorMessage(error) {
  if (error && typeof error === "object" && "message" in error && error.message) {
    return String(error.message);
  }
  return "Unable to complete sign in.";
}
