import assert from "node:assert/strict";
import test from "node:test";
import {
  createProfilePageState,
  getProfilePageView,
  loadProfile,
  normalizeProfileUser,
  setProfileError,
  setProfileLoading,
  setProfileSignedOut,
  setProfileUser,
} from "../../frontend/src/auth/profile-page.mjs";

const currentUser = {
  id: "user_1",
  name: "Ada Lovelace",
  nickname: "ada",
  email: "ada@example.com",
  avatarUrl: "https://example.com/ada.png",
};

test("profile page view shows current user avatar, email, display name, and nickname", () => {
  const state = createProfilePageState({ currentUser });
  const view = getProfilePageView(state);

  assert.equal(view.status, "signed-in");
  assert.equal(view.isSignedIn, true);
  assert.equal(view.displayName, "Ada Lovelace");
  assert.equal(view.nickname, "ada");
  assert.equal(view.email, "ada@example.com");
  assert.equal(view.avatarUrl, "https://example.com/ada.png");
  assert.equal(view.avatarInitials, "AL");
});

test("profile page supports loading and signed-out states without private user data", () => {
  const loading = setProfileLoading(createProfilePageState());
  assert.equal(getProfilePageView(loading).isLoading, true);
  assert.equal(getProfilePageView(loading).email, "");

  const signedOut = setProfileSignedOut(createProfilePageState({ currentUser }));
  const view = getProfilePageView(signedOut);
  assert.equal(view.status, "signed-out");
  assert.equal(view.isSignedOut, true);
  assert.equal(view.displayName, "");
  assert.equal(view.email, "");
});

test("setProfileUser normalizes common Google profile field aliases", () => {
  const state = setProfileUser(createProfilePageState(), {
    id: "user_2",
    displayName: "Grace Hopper",
    username: "grace",
    email: "grace@example.com",
    picture: "https://example.com/grace.png",
  });

  assert.deepEqual(state.currentUser, {
    id: "user_2",
    displayName: "Grace Hopper",
    nickname: "grace",
    email: "grace@example.com",
    avatarUrl: "https://example.com/grace.png",
  });
});

test("profile page falls back to initials when avatar is missing", () => {
  const view = getProfilePageView(
    createProfilePageState({
      currentUser: {
        id: "user_3",
        email: "linus@example.com",
      },
    }),
  );

  assert.equal(view.displayName, "linus@example.com");
  assert.equal(view.avatarUrl, "");
  assert.equal(view.avatarInitials, "L");
});

test("loadProfile accepts common current-user API envelopes", async () => {
  const loaded = await loadProfile(createProfilePageState(), {
    async getCurrentUser() {
      return {
        data: {
          user: currentUser,
        },
      };
    },
  });

  assert.equal(loaded.status, "signed-in");
  assert.equal(loaded.currentUser.email, "ada@example.com");
});

test("loadProfile converts unauthenticated responses into signed-out state", async () => {
  const signedOut = await loadProfile(createProfilePageState({ currentUser }), {
    async getCurrentUser() {
      throw { status: 401, code: "UNAUTHENTICATED" };
    },
  });

  assert.equal(signedOut.status, "signed-out");
  assert.equal(signedOut.currentUser, null);
});

test("profile error state exposes a safe retryable error message", () => {
  const state = setProfileError(createProfilePageState(), new Error("Session service unavailable"));
  const view = getProfilePageView(state);

  assert.equal(view.status, "error");
  assert.equal(view.hasError, true);
  assert.equal(view.errorMessage, "Session service unavailable");
});

test("normalizeProfileUser rejects missing ids", () => {
  assert.throws(() => normalizeProfileUser({ email: "missing@example.com" }), /user.id is required/);
});
