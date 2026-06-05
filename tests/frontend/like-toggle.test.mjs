import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLikeResult,
  applyOptimisticLikeToggle,
  createLikeState,
  failLikeToggle,
  formatLikeCount,
  getLikeView,
  markLikeSubmitting,
} from "../../frontend/src/likes/like-toggle.mjs";

const currentUser = { id: "user_1", name: "Ada" };

test("like view shows count and disabled state for signed-out users", () => {
  const state = createLikeState({
    postId: "post_1",
    currentUser: null,
    isLiked: false,
    likeCount: 2,
  });

  const view = getLikeView(state);
  assert.equal(view.isDisabled, true);
  assert.equal(view.buttonLabel, "Like");
  assert.equal(view.countLabel, "2 likes");
});

test("like view reflects liked state for signed-in users", () => {
  const state = createLikeState({
    postId: "post_1",
    currentUser,
    isLiked: true,
    likeCount: 1,
  });

  const view = getLikeView(state);
  assert.equal(view.isDisabled, false);
  assert.equal(view.isPressed, true);
  assert.equal(view.buttonLabel, "Unlike");
  assert.equal(view.countLabel, "1 like");
});

test("optimistic like toggle increments and decrements counts safely", () => {
  const unliked = createLikeState({
    postId: "post_1",
    currentUser,
    isLiked: false,
    likeCount: 0,
  });

  const liked = applyOptimisticLikeToggle(unliked);
  assert.equal(liked.isLiked, true);
  assert.equal(liked.likeCount, 1);
  assert.equal(liked.isSubmitting, true);

  const unlikedAgain = applyOptimisticLikeToggle(liked);
  assert.equal(unlikedAgain.isLiked, false);
  assert.equal(unlikedAgain.likeCount, 0);
});

test("applyLikeResult accepts common API response envelopes", () => {
  const pending = markLikeSubmitting(
    createLikeState({
      postId: "post_1",
      currentUser,
      isLiked: true,
      likeCount: 3,
    }),
  );

  const next = applyLikeResult(pending, {
    data: {
      liked: false,
      count: 2,
    },
  });

  assert.equal(next.isLiked, false);
  assert.equal(next.likeCount, 2);
  assert.equal(next.isSubmitting, false);
  assert.equal(next.errorMessage, "");
});

test("failed like toggle restores previous state and exposes a safe error", () => {
  const previous = createLikeState({
    postId: "post_1",
    currentUser,
    isLiked: false,
    likeCount: 4,
  });
  const failed = failLikeToggle(previous, new Error("Like service unavailable"));

  assert.equal(failed.isLiked, false);
  assert.equal(failed.likeCount, 4);
  assert.equal(failed.isSubmitting, false);
  assert.equal(failed.errorMessage, "Like service unavailable");
});

test("formatLikeCount normalizes invalid and singular counts", () => {
  assert.equal(formatLikeCount(-1), "0 likes");
  assert.equal(formatLikeCount("bad"), "0 likes");
  assert.equal(formatLikeCount(1), "1 like");
  assert.equal(formatLikeCount(3.9), "3 likes");
});
