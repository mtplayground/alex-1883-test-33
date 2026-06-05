export const MAX_COMMENT_LENGTH = 1000;

export function createCommentThreadState({ postId, currentUser, comments = [] }) {
  if (!postId) {
    throw new Error("postId is required");
  }

  return {
    postId,
    currentUser: currentUser ?? null,
    comments: comments.map(normalizeComment),
    draft: "",
    isSubmitting: false,
    errorMessage: "",
  };
}

export function getCommentThreadView(state) {
  const draft = state.draft.trim();
  return {
    comments: state.comments.map((comment) => ({
      ...comment,
      canDelete: canDeleteComment(state.currentUser, comment),
      displayTime: formatCommentTimestamp(comment.createdAt),
    })),
    isEmpty: state.comments.length === 0,
    canSubmit: Boolean(state.currentUser) && draft.length > 0 && draft.length <= MAX_COMMENT_LENGTH && !state.isSubmitting,
    remainingCharacters: MAX_COMMENT_LENGTH - state.draft.length,
    isOverLimit: state.draft.length > MAX_COMMENT_LENGTH,
    isSignedIn: Boolean(state.currentUser),
    errorMessage: state.errorMessage,
  };
}

export function setCommentDraft(state, draft) {
  return {
    ...state,
    draft: String(draft),
    errorMessage: "",
  };
}

export function markCommentSubmitting(state) {
  return {
    ...state,
    isSubmitting: true,
    errorMessage: "",
  };
}

export function appendComment(state, comment) {
  return {
    ...state,
    comments: [...state.comments, normalizeComment(comment)],
    draft: "",
    isSubmitting: false,
    errorMessage: "",
  };
}

export function removeComment(state, commentId) {
  return {
    ...state,
    comments: state.comments.filter((comment) => String(comment.id) !== String(commentId)),
    isSubmitting: false,
  };
}

export function failCommentSubmit(state, error) {
  return {
    ...state,
    isSubmitting: false,
    errorMessage: toSafeErrorMessage(error),
  };
}

export function createCommentThread({ postId, currentUser, comments = [], apiClient }) {
  if (!globalThis.document) {
    throw new Error("createCommentThread requires a browser document");
  }
  if (!apiClient || typeof apiClient.createComment !== "function") {
    throw new Error("apiClient.createComment is required");
  }

  let state = createCommentThreadState({ postId, currentUser, comments });
  const root = document.createElement("section");
  root.className = "comment-thread";
  root.setAttribute("aria-label", "Comments");

  const list = document.createElement("ol");
  list.className = "comment-thread__list";

  const empty = document.createElement("p");
  empty.className = "comment-thread__empty";
  empty.textContent = "No comments yet.";

  const form = document.createElement("form");
  form.className = "comment-thread__form";

  const label = document.createElement("label");
  label.className = "comment-thread__label";
  label.textContent = "Add a comment";

  const textarea = document.createElement("textarea");
  textarea.className = "comment-thread__input";
  textarea.name = "comment";
  textarea.maxLength = MAX_COMMENT_LENGTH;
  textarea.rows = 3;

  const meta = document.createElement("div");
  meta.className = "comment-thread__meta";

  const count = document.createElement("span");
  count.className = "comment-thread__count";

  const error = document.createElement("p");
  error.className = "comment-thread__error";
  error.setAttribute("role", "alert");

  const submit = document.createElement("button");
  submit.className = "comment-thread__submit";
  submit.type = "submit";
  submit.textContent = "Post";

  meta.append(count, submit);
  label.append(textarea);
  form.append(label, meta, error);
  root.append(list, empty, form);

  textarea.addEventListener("input", () => {
    state = setCommentDraft(state, textarea.value);
    render();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const view = getCommentThreadView(state);
    if (!view.canSubmit) {
      return;
    }

    state = markCommentSubmitting(state);
    render();

    try {
      const created = await apiClient.createComment(state.postId, state.draft.trim());
      state = appendComment(state, created);
      textarea.value = state.draft;
    } catch (caught) {
      state = failCommentSubmit(state, caught);
    }
    render();
  });

  function render() {
    const view = getCommentThreadView(state);
    list.replaceChildren(...view.comments.map((comment) => renderComment(comment, state, apiClient, setState)));
    empty.hidden = !view.isEmpty;
    textarea.disabled = state.isSubmitting || !view.isSignedIn;
    submit.disabled = !view.canSubmit;
    count.textContent = `${view.remainingCharacters} characters remaining`;
    error.textContent = view.errorMessage;
    error.hidden = !view.errorMessage;
  }

  function setState(nextState) {
    state = nextState;
    render();
  }

  render();

  return {
    element: root,
    getState() {
      return state;
    },
    setComments(nextComments) {
      state = {
        ...state,
        comments: nextComments.map(normalizeComment),
      };
      render();
    },
  };
}

function renderComment(comment, state, apiClient, setState) {
  const item = document.createElement("li");
  item.className = "comment-thread__item";

  const avatar = document.createElement("img");
  avatar.className = "comment-thread__avatar";
  avatar.alt = "";
  avatar.loading = "lazy";
  avatar.src = comment.author.avatarUrl || "";
  avatar.hidden = !comment.author.avatarUrl;

  const body = document.createElement("div");
  body.className = "comment-thread__body";

  const header = document.createElement("div");
  header.className = "comment-thread__header";

  const author = document.createElement("span");
  author.className = "comment-thread__author";
  author.textContent = comment.author.name;

  const time = document.createElement("time");
  time.className = "comment-thread__time";
  time.dateTime = comment.createdAt;
  time.textContent = comment.displayTime;

  const content = document.createElement("p");
  content.className = "comment-thread__content";
  content.textContent = comment.content;

  header.append(author, time);
  body.append(header, content);

  if (comment.canDelete && typeof apiClient.deleteComment === "function") {
    const remove = document.createElement("button");
    remove.className = "comment-thread__delete";
    remove.type = "button";
    remove.textContent = "Delete";
    remove.addEventListener("click", async () => {
      try {
        await apiClient.deleteComment(comment.id);
        setState(removeComment(state, comment.id));
      } catch (caught) {
        setState(failCommentSubmit(state, caught));
      }
    });
    body.append(remove);
  }

  item.append(avatar, body);
  return item;
}

function normalizeComment(comment) {
  if (!comment || comment.id === undefined || comment.id === null) {
    throw new Error("comment.id is required");
  }
  if (!comment.author || comment.author.id === undefined || comment.author.id === null) {
    throw new Error("comment.author.id is required");
  }

  const content = String(comment.content ?? "").trim();
  if (!content) {
    throw new Error("comment.content is required");
  }

  return {
    id: comment.id,
    content,
    createdAt: normalizeDate(comment.createdAt),
    author: {
      id: comment.author.id,
      name: String(comment.author.name || "Unknown user"),
      avatarUrl: comment.author.avatarUrl ? String(comment.author.avatarUrl) : "",
    },
  };
}

function canDeleteComment(currentUser, comment) {
  return Boolean(currentUser) && String(currentUser.id) === String(comment.author.id);
}

function formatCommentTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function normalizeDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error("comment.createdAt must be a valid date");
  }
  return date.toISOString();
}

function toSafeErrorMessage(error) {
  if (error && typeof error === "object" && "message" in error && error.message) {
    return String(error.message);
  }
  return "Unable to update comments. Please try again.";
}
