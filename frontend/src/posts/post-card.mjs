export function normalizePostCard(post) {
  if (!post || post.id === undefined || post.id === null) {
    throw new Error("post.id is required");
  }
  if (!post.imageUrl) {
    throw new Error("post.imageUrl is required");
  }

  const author = post.author ?? {};
  if (author.id === undefined || author.id === null) {
    throw new Error("post.author.id is required");
  }

  return {
    id: post.id,
    imageUrl: String(post.imageUrl),
    caption: String(post.caption ?? post.description ?? ""),
    createdAt: normalizeDate(post.createdAt),
    author: {
      id: author.id,
      name: String(author.name || "Unknown user"),
      avatarUrl: author.avatarUrl ? String(author.avatarUrl) : "",
    },
  };
}

export function getPostCardView(post) {
  const normalized = normalizePostCard(post);
  return {
    ...normalized,
    hasCaption: normalized.caption.trim().length > 0,
    imageAlt: normalized.caption.trim() || `Post image by ${normalized.author.name}`,
    displayTime: formatPostTimestamp(normalized.createdAt),
  };
}

export function createPostCard({ post, showTimestamp = true } = {}) {
  if (!globalThis.document) {
    throw new Error("createPostCard requires a browser document");
  }

  const view = getPostCardView(post);
  const article = document.createElement("article");
  article.className = "post-card";
  article.dataset.postId = String(view.id);

  const image = document.createElement("img");
  image.className = "post-card__image";
  image.alt = view.imageAlt;
  image.loading = "lazy";
  image.src = view.imageUrl;

  const body = document.createElement("div");
  body.className = "post-card__body";

  const header = document.createElement("header");
  header.className = "post-card__header";

  const author = document.createElement("div");
  author.className = "post-card__author";

  if (view.author.avatarUrl) {
    const avatar = document.createElement("img");
    avatar.className = "post-card__avatar";
    avatar.alt = "";
    avatar.loading = "lazy";
    avatar.src = view.author.avatarUrl;
    author.append(avatar);
  }

  const authorName = document.createElement("span");
  authorName.className = "post-card__author-name";
  authorName.textContent = view.author.name;
  author.append(authorName);

  header.append(author);

  if (showTimestamp) {
    const time = document.createElement("time");
    time.className = "post-card__time";
    time.dateTime = view.createdAt;
    time.textContent = view.displayTime;
    header.append(time);
  }

  const caption = document.createElement("p");
  caption.className = "post-card__caption";
  caption.textContent = view.caption;
  caption.hidden = !view.hasCaption;

  body.append(header, caption);
  article.append(image, body);
  return article;
}

export function formatPostTimestamp(value) {
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
    throw new Error("post.createdAt must be a valid date");
  }
  return date.toISOString();
}
