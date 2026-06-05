import assert from "node:assert/strict";
import test from "node:test";

import { createAuthState, getAuthView } from "../../frontend/src/auth/auth-context.mjs";
import {
  PROTECTED_ROUTE_PATTERNS,
  getHomeRouteDecision,
  getProtectedRouteDecision,
} from "../../frontend/src/auth/route-guards.mjs";

const currentUser = {
  id: "user_1",
  name: "Ada Lovelace",
  email: "ada@example.com",
};

test("protected route table covers feed, profile, and post detail routes", () => {
  assert.deepEqual(PROTECTED_ROUTE_PATTERNS, ["/feed", "/profile", "/post/:id"]);
});

test("home route sends signed-in users to the feed", () => {
  const decision = getHomeRouteDecision(getAuthView(createAuthState({ currentUser })));

  assert.deepEqual(decision, {
    action: "redirect",
    target: "/feed",
  });
});

test("home route keeps signed-out users on the public landing route", () => {
  const decision = getHomeRouteDecision(getAuthView(createAuthState({ status: "signed-out" })));

  assert.deepEqual(decision, {
    action: "landing",
    target: "",
  });
});

test("protected route allows signed-in users", () => {
  const decision = getProtectedRouteDecision(getAuthView(createAuthState({ currentUser })), {
    signInUrl: "/api/auth/google?next=%2Fprofile",
  });

  assert.deepEqual(decision, {
    action: "allow",
    signInUrl: "/api/auth/google?next=%2Fprofile",
  });
});

test("protected route redirects signed-out and error states to sign in", () => {
  const signedOut = getProtectedRouteDecision(getAuthView(createAuthState({ status: "signed-out" })), {
    signInUrl: "/api/auth/google?next=%2Ffeed",
  });
  assert.deepEqual(signedOut, {
    action: "redirect",
    signInUrl: "/api/auth/google?next=%2Ffeed",
  });

  const error = getProtectedRouteDecision(
    getAuthView(
      createAuthState({
        status: "error",
        errorMessage: "Session failed",
      }),
    ),
    {
      signInUrl: "/api/auth/google?next=%2Ffeed",
    },
  );
  assert.deepEqual(error, {
    action: "redirect",
    signInUrl: "/api/auth/google?next=%2Ffeed",
  });
});

test("protected route waits while session state is loading", () => {
  const decision = getProtectedRouteDecision(getAuthView(createAuthState({ status: "loading" })));

  assert.deepEqual(decision, {
    action: "loading",
    signInUrl: "/api/auth/google",
  });
});
