import assert from "node:assert/strict";
import test from "node:test";
import {
  createAuthCallbackState,
  createTopBarAuthState,
  getAuthCallbackView,
  getTopBarAuthView,
  parseAuthCallbackUrl,
  resolveAuthCallback,
} from "../../frontend/src/auth/sign-in-flow.mjs";

const currentUser = {
  id: "user_1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  avatarUrl: "https://example.com/ada.png",
};

test("top bar auth shows a right-side Sign in link to the Google start route when signed out", () => {
  const state = createTopBarAuthState({ signInUrl: "/auth/google?next=%2Ffeed" });
  const view = getTopBarAuthView(state);

  assert.equal(view.status, "signed-out");
  assert.equal(view.isSignedOut, true);
  assert.equal(view.buttonLabel, "Sign in");
  assert.equal(view.signInUrl, "/auth/google?next=%2Ffeed");
  assert.equal(view.displayName, "");
});

test("top bar auth shows profile entry with avatar when signed in", () => {
  const state = createTopBarAuthState({ currentUser, profileUrl: "/me" });
  const view = getTopBarAuthView(state);

  assert.equal(view.status, "signed-in");
  assert.equal(view.isSignedIn, true);
  assert.equal(view.buttonLabel, "Profile");
  assert.equal(view.profileUrl, "/me");
  assert.equal(view.displayName, "Ada Lovelace");
  assert.equal(view.avatarUrl, "https://example.com/ada.png");
});

test("top bar auth loading state disables account action", () => {
  const view = getTopBarAuthView(createTopBarAuthState({ status: "loading" }));
  assert.equal(view.status, "loading");
  assert.equal(view.isLoading, true);
  assert.equal(view.buttonLabel, "Sign in");
});

test("parseAuthCallbackUrl extracts Google OAuth code, state, and errors", () => {
  assert.deepEqual(parseAuthCallbackUrl("/auth/callback?code=abc&state=nonce"), {
    code: "abc",
    state: "nonce",
    error: "",
    errorDescription: "",
    hasCode: true,
    hasOAuthError: false,
  });

  const denied = parseAuthCallbackUrl("/auth/callback?error=access_denied&error_description=Denied");
  assert.equal(denied.hasOAuthError, true);
  assert.equal(denied.error, "access_denied");
  assert.equal(denied.errorDescription, "Denied");
});

test("resolveAuthCallback exchanges code and stores returned token", async () => {
  const calls = [];
  const savedTokens = [];
  const state = await resolveAuthCallback({
    url: "/auth/callback?code=abc&state=nonce",
    redirectTo: "/feed",
    apiClient: {
      async completeGoogleSignIn(input) {
        calls.push(input);
        return {
          token: "jwt-token",
          redirectTo: "/profile",
          user: currentUser,
        };
      },
    },
    tokenStore: {
      saveToken(token) {
        savedTokens.push(token);
      },
    },
  });

  assert.deepEqual(calls, [{ code: "abc", state: "nonce" }]);
  assert.deepEqual(savedTokens, ["jwt-token"]);
  assert.equal(state.status, "success");
  assert.equal(state.redirectTo, "/profile");
  assert.equal(state.token, "jwt-token");
  assert.equal(state.currentUser.email, "ada@example.com");
});

test("resolveAuthCallback reports missing code and OAuth provider errors", async () => {
  const missingCode = await resolveAuthCallback({
    url: "/auth/callback",
    apiClient: {
      async completeGoogleSignIn() {
        throw new Error("should not call API");
      },
    },
  });
  assert.equal(missingCode.status, "error");
  assert.equal(missingCode.errorMessage, "Missing Google authorization code.");

  const providerError = await resolveAuthCallback({
    url: "/auth/callback?error=access_denied&error_description=Denied",
    apiClient: {
      async completeGoogleSignIn() {
        throw new Error("should not call API");
      },
    },
  });
  assert.equal(providerError.status, "error");
  assert.equal(providerError.errorMessage, "Denied");
});

test("resolveAuthCallback returns safe error state when exchange fails", async () => {
  const state = await resolveAuthCallback({
    url: "/auth/callback?code=abc",
    apiClient: {
      async completeGoogleSignIn() {
        throw new Error("Google callback failed");
      },
    },
  });

  assert.equal(state.status, "error");
  assert.equal(state.errorMessage, "Google callback failed");
});

test("auth callback view exposes loading, success, and error states", () => {
  assert.equal(getAuthCallbackView(createAuthCallbackState({ status: "loading" })).isLoading, true);
  assert.equal(getAuthCallbackView(createAuthCallbackState({ status: "success", currentUser })).isSuccess, true);

  const error = getAuthCallbackView(createAuthCallbackState({ status: "error", errorMessage: "Denied" }));
  assert.equal(error.hasError, true);
  assert.equal(error.errorMessage, "Denied");
});
