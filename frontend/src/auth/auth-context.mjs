import { createApiClient, createLocalStorageTokenStore } from "./api-client.mjs";
import { normalizeProfileUser } from "./profile-page.mjs";

export function createAuthState({ status = "loading", currentUser = null, token = "", errorMessage = "" } = {}) {
  const normalizedUser = currentUser ? normalizeProfileUser(currentUser) : null;
  return {
    status: normalizedUser ? "signed-in" : normalizeAuthStatus(status),
    currentUser: normalizedUser,
    token: token ? String(token) : "",
    errorMessage: errorMessage ? String(errorMessage) : "",
  };
}

export function getAuthView(state) {
  const status = normalizeAuthStatus(state.status);
  return {
    status,
    currentUser: state.currentUser,
    isLoading: status === "loading",
    isSignedIn: status === "signed-in" && Boolean(state.currentUser),
    isSignedOut: status === "signed-out",
    hasError: status === "error",
    errorMessage: status === "error" ? state.errorMessage || "Unable to load session." : "",
  };
}

export function createAuthContext({
  apiClient,
  tokenStore = createLocalStorageTokenStore(),
  signInUrl = "/auth/google",
  location = globalThis.location,
} = {}) {
  const client = apiClient ?? createApiClient({ tokenStore });
  const listeners = new Set();
  let state = createAuthState({
    status: tokenStore.getToken?.() ? "loading" : "signed-out",
    token: tokenStore.getToken?.() ?? "",
  });

  function setState(nextState) {
    state = createAuthState(nextState);
    for (const listener of listeners) {
      listener(state);
    }
    return state;
  }

  async function loadSession() {
    if (!tokenStore.getToken?.()) {
      return setState({ status: "signed-out" });
    }

    setState({ ...state, status: "loading" });
    try {
      const result = await client.getCurrentUser();
      const user = readObject(result, ["user", "me", "currentUser", "data.user", "data.me", "data.currentUser", "data"]);
      if (!user) {
        tokenStore.clearToken?.();
        return setState({ status: "signed-out" });
      }
      return setState({
        status: "signed-in",
        currentUser: user,
        token: tokenStore.getToken?.() ?? "",
      });
    } catch (caught) {
      if (isUnauthenticatedError(caught)) {
        tokenStore.clearToken?.();
        return setState({ status: "signed-out" });
      }
      return setState({
        ...state,
        status: "error",
        errorMessage: toSafeErrorMessage(caught),
      });
    }
  }

  async function completeGoogleCallback({ code, state: callbackState }) {
    setState({ ...state, status: "loading" });
    try {
      const result = await client.completeGoogleSignIn({ code, state: callbackState });
      const token = readString(result, ["token", "accessToken", "jwt", "data.token", "data.accessToken", "data.jwt"]);
      if (token) {
        tokenStore.saveToken?.(token);
      }
      const user = readObject(result, ["user", "currentUser", "data.user", "data.currentUser"]);
      return setState({
        status: user ? "signed-in" : "loading",
        currentUser: user,
        token,
      });
    } catch (caught) {
      return setState({
        status: "error",
        errorMessage: toSafeErrorMessage(caught),
      });
    }
  }

  function signOut() {
    tokenStore.clearToken?.();
    return setState({ status: "signed-out" });
  }

  function getSignInUrl(nextPath = location?.pathname ?? "/") {
    const url = new URL(signInUrl, "http://local");
    if (nextPath) {
      url.searchParams.set("next", String(nextPath));
    }
    return `${url.pathname}${url.search}${url.hash}`;
  }

  function startSignIn(nextPath) {
    const destination = getSignInUrl(nextPath);
    if (location && typeof location.assign === "function") {
      location.assign(destination);
    }
    return destination;
  }

  return {
    getState() {
      return state;
    },
    getView() {
      return getAuthView(state);
    },
    getApiClient() {
      return client;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setState,
    loadSession,
    completeGoogleCallback,
    signOut,
    getSignInUrl,
    startSignIn,
  };
}

function normalizeAuthStatus(status) {
  const normalized = String(status || "loading");
  if (["loading", "signed-out", "signed-in", "error"].includes(normalized)) {
    return normalized;
  }
  return "loading";
}

function readString(value, paths) {
  for (const path of paths) {
    const candidate = getByPath(value, path);
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
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

function isUnauthenticatedError(error) {
  return error?.status === 401 || error?.code === "UNAUTHENTICATED" || error?.response?.error?.code === "UNAUTHENTICATED";
}

function toSafeErrorMessage(error) {
  if (error && typeof error === "object" && "message" in error && error.message) {
    return String(error.message);
  }
  return "Unable to load session.";
}
