import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryTokenStore } from "../../frontend/src/auth/api-client.mjs";
import {
  createAuthContext,
  createAuthState,
  getAuthView,
} from "../../frontend/src/auth/auth-context.mjs";

const currentUser = {
  id: "user_1",
  name: "Ada Lovelace",
  email: "ada@example.com",
};

test("auth state exposes signed-in, signed-out, loading, and error views", () => {
  assert.equal(getAuthView(createAuthState({ status: "loading" })).isLoading, true);
  assert.equal(getAuthView(createAuthState({ status: "signed-out" })).isSignedOut, true);
  assert.equal(getAuthView(createAuthState({ currentUser })).isSignedIn, true);

  const error = getAuthView(createAuthState({ status: "error", errorMessage: "Session failed" }));
  assert.equal(error.hasError, true);
  assert.equal(error.errorMessage, "Session failed");
});

test("auth context loads current user when a JWT exists", async () => {
  const tokenStore = createMemoryTokenStore("jwt-token");
  const states = [];
  const context = createAuthContext({
    tokenStore,
    apiClient: {
      async getCurrentUser() {
        return { user: currentUser };
      },
    },
  });
  context.subscribe((state) => states.push(state.status));

  const state = await context.loadSession();

  assert.equal(state.status, "signed-in");
  assert.equal(state.currentUser.email, "ada@example.com");
  assert.deepEqual(states, ["loading", "signed-in"]);
});

test("auth context clears token on unauthenticated session load", async () => {
  const tokenStore = createMemoryTokenStore("expired-token");
  const context = createAuthContext({
    tokenStore,
    apiClient: {
      async getCurrentUser() {
        throw { status: 401, code: "UNAUTHENTICATED" };
      },
    },
  });

  const state = await context.loadSession();

  assert.equal(state.status, "signed-out");
  assert.equal(tokenStore.getToken(), "");
});

test("auth context completes Google callback and stores returned JWT", async () => {
  const tokenStore = createMemoryTokenStore();
  const calls = [];
  const context = createAuthContext({
    tokenStore,
    apiClient: {
      async completeGoogleSignIn(input) {
        calls.push(input);
        return {
          token: "jwt-token",
          user: currentUser,
        };
      },
    },
  });

  const state = await context.completeGoogleCallback({ code: "code_1", state: "nonce" });

  assert.deepEqual(calls, [{ code: "code_1", state: "nonce" }]);
  assert.equal(tokenStore.getToken(), "jwt-token");
  assert.equal(state.status, "signed-in");
  assert.equal(state.currentUser.displayName, "Ada Lovelace");
});

test("auth context signOut clears token and notifies subscribers", () => {
  const tokenStore = createMemoryTokenStore("jwt-token");
  const observed = [];
  const context = createAuthContext({ tokenStore });
  context.subscribe((state) => observed.push(state.status));

  const state = context.signOut();

  assert.equal(state.status, "signed-out");
  assert.equal(tokenStore.getToken(), "");
  assert.deepEqual(observed, ["signed-out"]);
});

test("auth context builds and starts sign-in redirects with next path", () => {
  const assigned = [];
  const context = createAuthContext({
    signInUrl: "/auth/google",
    location: {
      pathname: "/feed",
      assign(value) {
        assigned.push(value);
      },
    },
  });

  assert.equal(context.getSignInUrl(), "/auth/google?next=%2Ffeed");
  assert.equal(context.startSignIn("/profile"), "/auth/google?next=%2Fprofile");
  assert.deepEqual(assigned, ["/auth/google?next=%2Fprofile"]);
});

test("auth context reports safe error state when session load fails", async () => {
  const context = createAuthContext({
    tokenStore: createMemoryTokenStore("jwt-token"),
    apiClient: {
      async getCurrentUser() {
        throw new Error("Network unavailable");
      },
    },
  });

  const state = await context.loadSession();

  assert.equal(state.status, "error");
  assert.equal(state.errorMessage, "Network unavailable");
});
