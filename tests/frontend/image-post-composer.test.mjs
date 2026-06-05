import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_POST_CAPTION_LENGTH,
  applyPostCreatedSuccess,
  collectPreviewUrlsForCleanup,
  createImagePostComposerState,
  failPostSubmit,
  getImagePostComposerView,
  markPostSubmitting,
  removeSelectedImage,
  selectImageFile,
  setPostCaption,
} from "../../frontend/src/uploads/image-post-composer.mjs";

const currentUser = { id: "user_1", name: "Ada" };
const imageFile = { name: "image.png", type: "image/png", size: 128 };

test("image composer starts idle and requires sign-in plus an image before submit", () => {
  const signedOut = createImagePostComposerState({ currentUser: null });
  assert.equal(getImagePostComposerView(signedOut).canSubmit, false);
  assert.equal(getImagePostComposerView(signedOut).isSignedIn, false);

  const signedIn = createImagePostComposerState({ currentUser });
  const view = getImagePostComposerView(signedIn);
  assert.equal(view.canSubmit, false);
  assert.equal(view.hasImage, false);
  assert.equal(view.captionRemaining, MAX_POST_CAPTION_LENGTH);
});

test("selectImageFile shows a preview and enables submit", () => {
  const state = selectImageFile(createImagePostComposerState({ currentUser }), {
    file: imageFile,
    previewUrl: "blob:preview-1",
  });

  const view = getImagePostComposerView(state);
  assert.equal(view.hasImage, true);
  assert.equal(view.previewUrl, "blob:preview-1");
  assert.equal(view.canSubmit, true);
  assert.equal(view.canRemoveImage, true);
});

test("caption updates enforce length limits without dropping the preview", () => {
  const selected = selectImageFile(createImagePostComposerState({ currentUser }), {
    file: imageFile,
    previewUrl: "blob:preview-1",
  });
  const overLimit = setPostCaption(selected, "x".repeat(MAX_POST_CAPTION_LENGTH + 1));

  const view = getImagePostComposerView(overLimit);
  assert.equal(view.hasImage, true);
  assert.equal(view.isOverLimit, true);
  assert.equal(view.canSubmit, false);
  assert.equal(view.captionRemaining, -1);
});

test("submitting disables controls and keeps selected image state", () => {
  const selected = selectImageFile(createImagePostComposerState({ currentUser }), {
    file: imageFile,
    previewUrl: "blob:preview-1",
  });
  const submitting = markPostSubmitting(setPostCaption(selected, "hello"));

  const view = getImagePostComposerView(submitting);
  assert.equal(view.isSubmitting, true);
  assert.equal(view.hasImage, true);
  assert.equal(view.canSubmit, false);
});

test("failed submit preserves image preview and description", () => {
  const submitting = markPostSubmitting(
    setPostCaption(
      selectImageFile(createImagePostComposerState({ currentUser }), {
        file: imageFile,
        previewUrl: "blob:preview-1",
      }),
      "keep this",
    ),
  );

  const failed = failPostSubmit(submitting, new Error("Upload unavailable"));
  assert.equal(failed.previewUrl, "blob:preview-1");
  assert.equal(failed.caption, "keep this");
  assert.equal(failed.errorMessage, "Upload unavailable");
  assert.equal(getImagePostComposerView(failed).canSubmit, true);
});

test("successful submit clears selected image and caption without marking preview for immediate revoke", () => {
  const submitting = markPostSubmitting(
    setPostCaption(
      selectImageFile(createImagePostComposerState({ currentUser }), {
        file: imageFile,
        previewUrl: "blob:preview-1",
      }),
      "created caption",
    ),
  );

  const success = applyPostCreatedSuccess(submitting, { post: { id: "post_1" } });

  assert.equal(success.file, null);
  assert.equal(success.previewUrl, "");
  assert.equal(success.caption, "");
  assert.deepEqual(success.createdPost, { id: "post_1" });
  assert.deepEqual(success.retiredPreviewUrls, ["blob:preview-1"]);
});

test("successful submit exposes the created post for feed prepending", () => {
  const success = applyPostCreatedSuccess(createImagePostComposerState({ currentUser }), {
    post: {
      id: "post_1",
      imageUrl: "https://example.com/post_1.png",
      caption: "created",
      author: currentUser,
    },
  });

  assert.equal(success.createdPost.id, "post_1");
  assert.equal(success.createdPost.caption, "created");
});

test("removeSelectedImage returns the preview URL for explicit user-driven revoke", () => {
  const selected = selectImageFile(createImagePostComposerState({ currentUser }), {
    file: imageFile,
    previewUrl: "blob:preview-1",
  });

  const result = removeSelectedImage(selected);
  assert.equal(result.previewUrlToRevoke, "blob:preview-1");
  assert.equal(result.state.previewUrl, "");
  assert.equal(result.state.file, null);
});

test("replacing images defers old preview cleanup until component destroy", () => {
  const first = selectImageFile(createImagePostComposerState({ currentUser }), {
    file: imageFile,
    previewUrl: "blob:preview-1",
  });
  const second = selectImageFile(first, {
    file: { name: "next.png", type: "image/png", size: 256 },
    previewUrl: "blob:preview-2",
  });

  assert.deepEqual(collectPreviewUrlsForCleanup(second), ["blob:preview-1", "blob:preview-2"]);
});

test("selectImageFile rejects missing file or preview URL", () => {
  const state = createImagePostComposerState({ currentUser });
  assert.throws(() => selectImageFile(state, { file: null, previewUrl: "blob:preview-1" }), /image file is required/);
  assert.throws(() => selectImageFile(state, { file: imageFile, previewUrl: "" }), /previewUrl is required/);
});
