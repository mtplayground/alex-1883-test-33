import assert from "node:assert/strict";
import test from "node:test";

import { createAuthState, getAuthView } from "../../frontend/src/auth/auth-context.mjs";
import { getTopBarModel } from "../../frontend/src/layout/app-layout.mjs";

const currentUser = {
  id: "user_1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  avatarUrl: "https://example.com/ada.png",
};

test("top bar model shows Sign in for signed-out visitors", () => {
  const model = getTopBarModel(getAuthView(createAuthState({ status: "signed-out" })), {
    signInUrl: "/auth/google?next=%2Ffeed",
  });

  assert.equal(model.status, "signed-out");
  assert.equal(model.showSignIn, true);
  assert.equal(model.showUserMenu, false);
  assert.equal(model.label, "Sign in");
  assert.equal(model.signInUrl, "/auth/google?next=%2Ffeed");
});

test("top bar model shows loading without exposing signed-in controls", () => {
  const model = getTopBarModel(getAuthView(createAuthState({ status: "loading" })));

  assert.equal(model.status, "loading");
  assert.equal(model.showSignIn, false);
  assert.equal(model.showUserMenu, false);
  assert.equal(model.label, "Loading");
});

test("top bar model shows a signed-in user menu with profile data", () => {
  const model = getTopBarModel(getAuthView(createAuthState({ currentUser })));

  assert.equal(model.status, "signed-in");
  assert.equal(model.showSignIn, false);
  assert.equal(model.showUserMenu, true);
  assert.equal(model.label, "Ada Lovelace");
  assert.equal(model.email, "ada@example.com");
  assert.equal(model.avatarUrl, "https://example.com/ada.png");
});

test("top bar model treats auth errors as signed-out sign-in opportunities", () => {
  const model = getTopBarModel(
    getAuthView(
      createAuthState({
        status: "error",
        errorMessage: "Session service unavailable",
      }),
    ),
  );

  assert.equal(model.status, "error");
  assert.equal(model.showSignIn, true);
  assert.equal(model.showUserMenu, false);
  assert.equal(model.errorMessage, "Session service unavailable");
});
