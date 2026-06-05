import assert from "node:assert/strict";
import test from "node:test";
import {
  applyFollowResult,
  applyOptimisticFollowToggle,
  createFollowState,
  failFollowToggle,
  formatFollowerCount,
  formatFollowingCount,
  getFollowView,
  markFollowSubmitting,
} from "../../frontend/src/follows/follow-toggle.mjs";

const currentUser = { id: "user_1", name: "Ada" };
const targetUser = { id: "user_2", name: "Grace", avatarUrl: "https://example.com/grace.png" };

test("follow view shows counts and disabled state for signed-out users", () => {
  const state = createFollowState({
    targetUser,
    currentUser: null,
    isFollowing: false,
    followerCount: 2,
    followingCount: 3,
  });

  const view = getFollowView(state);
  assert.equal(view.isDisabled, true);
  assert.equal(view.buttonLabel, "Follow");
  assert.equal(view.followerCountLabel, "2 followers");
  assert.equal(view.followingCountLabel, "3 following");
});

test("follow view reflects followed state for signed-in users", () => {
  const state = createFollowState({
    targetUser,
    currentUser,
    isFollowing: true,
    followerCount: 1,
    followingCount: 4,
  });

  const view = getFollowView(state);
  assert.equal(view.isDisabled, false);
  assert.equal(view.isPressed, true);
  assert.equal(view.buttonLabel, "Unfollow");
  assert.equal(view.followerCountLabel, "1 follower");
});

test("follow view disables self-follow on the current user's own card", () => {
  const state = createFollowState({
    targetUser: currentUser,
    currentUser,
    isFollowing: false,
    followerCount: 5,
  });

  const view = getFollowView(state);
  assert.equal(view.isSelf, true);
  assert.equal(view.isDisabled, true);
});

test("optimistic follow toggle increments and decrements follower counts safely", () => {
  const notFollowing = createFollowState({
    targetUser,
    currentUser,
    isFollowing: false,
    followerCount: 0,
  });

  const following = applyOptimisticFollowToggle(notFollowing);
  assert.equal(following.isFollowing, true);
  assert.equal(following.followerCount, 1);
  assert.equal(following.isSubmitting, true);

  const notFollowingAgain = applyOptimisticFollowToggle(following);
  assert.equal(notFollowingAgain.isFollowing, false);
  assert.equal(notFollowingAgain.followerCount, 0);
});

test("applyFollowResult accepts common API response envelopes", () => {
  const pending = markFollowSubmitting(
    createFollowState({
      targetUser,
      currentUser,
      isFollowing: true,
      followerCount: 3,
      followingCount: 4,
    }),
  );

  const next = applyFollowResult(pending, {
    data: {
      following: false,
      followersCount: 2,
      followingCount: 5,
    },
  });

  assert.equal(next.isFollowing, false);
  assert.equal(next.followerCount, 2);
  assert.equal(next.followingCount, 5);
  assert.equal(next.isSubmitting, false);
  assert.equal(next.errorMessage, "");
});

test("failed follow toggle restores previous state and exposes a safe error", () => {
  const previous = createFollowState({
    targetUser,
    currentUser,
    isFollowing: false,
    followerCount: 4,
  });
  const failed = failFollowToggle(previous, new Error("Follow service unavailable"));

  assert.equal(failed.isFollowing, false);
  assert.equal(failed.followerCount, 4);
  assert.equal(failed.isSubmitting, false);
  assert.equal(failed.errorMessage, "Follow service unavailable");
});

test("follow count labels normalize invalid and singular counts", () => {
  assert.equal(formatFollowerCount(-1), "0 followers");
  assert.equal(formatFollowerCount("bad"), "0 followers");
  assert.equal(formatFollowerCount(1), "1 follower");
  assert.equal(formatFollowerCount(3.9), "3 followers");
  assert.equal(formatFollowingCount("bad"), "0 following");
  assert.equal(formatFollowingCount(2.8), "2 following");
});

test("follow state rejects missing target ids", () => {
  assert.throws(() => createFollowState({ targetUser: {}, currentUser }), /targetUser.id is required/);
});
