import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_COMMENT_LENGTH,
  appendComment,
  createCommentThreadState,
  failCommentSubmit,
  getCommentThreadView,
  markCommentSubmitting,
  removeComment,
  setCommentDraft,
} from "../../frontend/src/comments/comment-thread.mjs";

const currentUser = { id: "user_1", name: "Ada" };
const otherUser = { id: "user_2", name: "Grace" };
const createdAt = "2026-06-05T03:00:00.000Z";

test("comment thread view shows an empty state and disables submit without draft text", () => {
  const state = createCommentThreadState({
    postId: "post_1",
    currentUser,
    comments: [],
  });
  const view = getCommentThreadView(state);

  assert.equal(view.isEmpty, true);
  assert.equal(view.isSignedIn, true);
  assert.equal(view.canSubmit, false);
  assert.equal(view.remainingCharacters, MAX_COMMENT_LENGTH);
});

test("comment draft enables submit when signed in and within the length limit", () => {
  const state = setCommentDraft(
    createCommentThreadState({
      postId: "post_1",
      currentUser,
      comments: [],
    }),
    "  Looks good  ",
  );
  const view = getCommentThreadView(state);

  assert.equal(view.canSubmit, true);
  assert.equal(view.isOverLimit, false);
  assert.equal(view.remainingCharacters, MAX_COMMENT_LENGTH - state.draft.length);
});

test("comment draft blocks submit when signed out or over the limit", () => {
  const signedOut = setCommentDraft(
    createCommentThreadState({
      postId: "post_1",
      currentUser: null,
      comments: [],
    }),
    "Hello",
  );
  assert.equal(getCommentThreadView(signedOut).canSubmit, false);

  const overLimit = setCommentDraft(
    createCommentThreadState({
      postId: "post_1",
      currentUser,
      comments: [],
    }),
    "x".repeat(MAX_COMMENT_LENGTH + 1),
  );
  const view = getCommentThreadView(overLimit);
  assert.equal(view.canSubmit, false);
  assert.equal(view.isOverLimit, true);
});

test("comment list marks only author-owned comments as deletable", () => {
  const state = createCommentThreadState({
    postId: "post_1",
    currentUser,
    comments: [
      comment({ id: "comment_1", author: currentUser }),
      comment({ id: "comment_2", author: otherUser }),
    ],
  });

  const view = getCommentThreadView(state);
  assert.deepEqual(
    view.comments.map((item) => [item.id, item.canDelete]),
    [
      ["comment_1", true],
      ["comment_2", false],
    ],
  );
});

test("appendComment adds the submitted comment and clears input state", () => {
  const drafting = markCommentSubmitting(
    setCommentDraft(
      createCommentThreadState({
        postId: "post_1",
        currentUser,
        comments: [],
      }),
      "New comment",
    ),
  );

  const next = appendComment(drafting, comment({ id: "comment_3", author: currentUser, content: "New comment" }));

  assert.equal(next.comments.length, 1);
  assert.equal(next.comments[0].content, "New comment");
  assert.equal(next.draft, "");
  assert.equal(next.isSubmitting, false);
  assert.equal(getCommentThreadView(next).isEmpty, false);
});

test("failed comment submit preserves the draft and exposes a safe error", () => {
  const drafting = markCommentSubmitting(
    setCommentDraft(
      createCommentThreadState({
        postId: "post_1",
        currentUser,
        comments: [],
      }),
      "Do not lose this",
    ),
  );

  const next = failCommentSubmit(drafting, new Error("Comment service unavailable"));

  assert.equal(next.draft, "Do not lose this");
  assert.equal(next.isSubmitting, false);
  assert.equal(next.errorMessage, "Comment service unavailable");
});

test("removeComment removes only the selected comment", () => {
  const state = createCommentThreadState({
    postId: "post_1",
    currentUser,
    comments: [
      comment({ id: "comment_1", author: currentUser }),
      comment({ id: "comment_2", author: otherUser }),
    ],
  });

  const next = removeComment(state, "comment_1");

  assert.deepEqual(
    next.comments.map((item) => item.id),
    ["comment_2"],
  );
});

function comment({ id, author, content = "Hello" }) {
  return {
    id,
    author,
    content,
    createdAt,
  };
}
