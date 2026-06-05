export const MAX_POST_CAPTION_LENGTH = 1000;

export function createImagePostComposerState({ currentUser, maxCaptionLength = MAX_POST_CAPTION_LENGTH } = {}) {
  return {
    currentUser: currentUser ?? null,
    maxCaptionLength,
    file: null,
    previewUrl: "",
    retiredPreviewUrls: [],
    caption: "",
    isSubmitting: false,
    errorMessage: "",
    createdPost: null,
  };
}

export function getImagePostComposerView(state) {
  const captionLength = state.caption.length;
  const isSignedIn = Boolean(state.currentUser);
  const hasImage = Boolean(state.file && state.previewUrl);
  const isOverLimit = captionLength > state.maxCaptionLength;

  return {
    isSignedIn,
    hasImage,
    previewUrl: state.previewUrl,
    caption: state.caption,
    captionRemaining: state.maxCaptionLength - captionLength,
    isOverLimit,
    canSubmit: isSignedIn && hasImage && !isOverLimit && !state.isSubmitting,
    canRemoveImage: hasImage && !state.isSubmitting,
    isSubmitting: state.isSubmitting,
    isSuccess: Boolean(state.createdPost),
    errorMessage: state.errorMessage,
  };
}

export function selectImageFile(state, { file, previewUrl }) {
  if (!file) {
    throw new Error("image file is required");
  }
  if (!previewUrl) {
    throw new Error("previewUrl is required");
  }

  const retiredPreviewUrls = state.previewUrl
    ? [...state.retiredPreviewUrls, state.previewUrl]
    : state.retiredPreviewUrls;

  return {
    ...state,
    file,
    previewUrl: String(previewUrl),
    retiredPreviewUrls,
    errorMessage: "",
    createdPost: null,
  };
}

export function removeSelectedImage(state) {
  return {
    state: {
      ...state,
      file: null,
      previewUrl: "",
      errorMessage: "",
    },
    previewUrlToRevoke: state.previewUrl || null,
  };
}

export function setPostCaption(state, caption) {
  return {
    ...state,
    caption: String(caption),
    errorMessage: "",
    createdPost: null,
  };
}

export function markPostSubmitting(state) {
  return {
    ...state,
    isSubmitting: true,
    errorMessage: "",
    createdPost: null,
  };
}

export function applyPostCreatedSuccess(state, createdPost) {
  const retiredPreviewUrls = state.previewUrl
    ? [...state.retiredPreviewUrls, state.previewUrl]
    : state.retiredPreviewUrls;

  return {
    ...state,
    file: null,
    previewUrl: "",
    retiredPreviewUrls,
    caption: "",
    isSubmitting: false,
    errorMessage: "",
    createdPost: normalizeCreatedPost(createdPost),
  };
}

export function failPostSubmit(state, error) {
  return {
    ...state,
    isSubmitting: false,
    errorMessage: toSafeErrorMessage(error),
  };
}

export function collectPreviewUrlsForCleanup(state) {
  return [...state.retiredPreviewUrls, state.previewUrl].filter(Boolean);
}

export function createImagePostComposer({
  currentUser,
  apiClient,
  maxCaptionLength = MAX_POST_CAPTION_LENGTH,
  onPostCreated,
} = {}) {
  if (!globalThis.document) {
    throw new Error("createImagePostComposer requires a browser document");
  }
  if (!apiClient || typeof apiClient.uploadImage !== "function" || typeof apiClient.createPost !== "function") {
    throw new Error("apiClient.uploadImage and apiClient.createPost are required");
  }

  let state = createImagePostComposerState({ currentUser, maxCaptionLength });

  const root = document.createElement("section");
  root.className = "image-post-composer";
  root.setAttribute("aria-label", "Create image post");

  const form = document.createElement("form");
  form.className = "image-post-composer__form";

  const fileLabel = document.createElement("label");
  fileLabel.className = "image-post-composer__file-label";
  fileLabel.textContent = "Image";

  const fileInput = document.createElement("input");
  fileInput.className = "image-post-composer__file-input";
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.name = "image";

  const preview = document.createElement("img");
  preview.className = "image-post-composer__preview";
  preview.alt = "Selected image preview";

  const remove = document.createElement("button");
  remove.className = "image-post-composer__remove";
  remove.type = "button";
  remove.textContent = "Remove";

  const captionLabel = document.createElement("label");
  captionLabel.className = "image-post-composer__caption-label";
  captionLabel.textContent = "Description";

  const caption = document.createElement("textarea");
  caption.className = "image-post-composer__caption";
  caption.name = "caption";
  caption.maxLength = maxCaptionLength;
  caption.rows = 4;

  const meta = document.createElement("div");
  meta.className = "image-post-composer__meta";

  const count = document.createElement("span");
  count.className = "image-post-composer__count";

  const submit = document.createElement("button");
  submit.className = "image-post-composer__submit";
  submit.type = "submit";
  submit.textContent = "Post";

  const error = document.createElement("p");
  error.className = "image-post-composer__error";
  error.setAttribute("role", "alert");

  const success = document.createElement("p");
  success.className = "image-post-composer__success";
  success.setAttribute("role", "status");

  fileLabel.append(fileInput);
  captionLabel.append(caption);
  meta.append(count, submit);
  form.append(fileLabel, preview, remove, captionLabel, meta, error, success);
  root.append(form);

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0] ?? null;
    if (!file) {
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    state = selectImageFile(state, { file, previewUrl });
    render();
  });

  remove.addEventListener("click", () => {
    const result = removeSelectedImage(state);
    state = result.state;
    if (result.previewUrlToRevoke) {
      URL.revokeObjectURL(result.previewUrlToRevoke);
    }
    fileInput.value = "";
    render();
  });

  caption.addEventListener("input", () => {
    state = setPostCaption(state, caption.value);
    render();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const view = getImagePostComposerView(state);
    if (!view.canSubmit) {
      return;
    }

    state = markPostSubmitting(state);
    render();

    try {
      const upload = await apiClient.uploadImage(state.file);
      const imageUrl = readString(upload, ["imageUrl", "url", "data.imageUrl", "data.url"]);
      if (!imageUrl) {
        throw new Error("Upload response did not include an image URL");
      }
      const createdPost = await apiClient.createPost({
        imageUrl,
        caption: state.caption.trim(),
      });
      state = applyPostCreatedSuccess(state, createdPost);
      onPostCreated?.(state.createdPost);
      fileInput.value = "";
      caption.value = state.caption;
    } catch (caught) {
      state = failPostSubmit(state, caught);
    }
    render();
  });

  function render() {
    const view = getImagePostComposerView(state);
    fileInput.disabled = state.isSubmitting || !view.isSignedIn;
    caption.disabled = state.isSubmitting || !view.isSignedIn;
    submit.disabled = !view.canSubmit;
    remove.disabled = !view.canRemoveImage;
    remove.hidden = !view.hasImage;
    preview.hidden = !view.hasImage;
    preview.src = view.previewUrl;
    caption.value = state.caption;
    count.textContent = `${view.captionRemaining} characters remaining`;
    error.textContent = view.errorMessage;
    error.hidden = !view.errorMessage;
    success.textContent = view.isSuccess ? "Post created." : "";
    success.hidden = !view.isSuccess;
  }

  render();

  return {
    element: root,
    getState() {
      return state;
    },
    destroy() {
      for (const previewUrl of collectPreviewUrlsForCleanup(state)) {
        URL.revokeObjectURL(previewUrl);
      }
      state = {
        ...state,
        previewUrl: "",
        retiredPreviewUrls: [],
      };
    },
  };
}

function normalizeCreatedPost(createdPost) {
  if (!createdPost || typeof createdPost !== "object") {
    return {};
  }
  return createdPost.post ?? createdPost.data ?? createdPost;
}

function readString(value, paths) {
  for (const path of paths) {
    const candidate = getByPath(value, path);
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return "";
}

function getByPath(value, path) {
  return path.split(".").reduce((current, segment) => {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    return current[segment];
  }, value);
}

function toSafeErrorMessage(error) {
  if (error && typeof error === "object" && "message" in error && error.message) {
    return String(error.message);
  }
  return "Unable to create post. Please try again.";
}
