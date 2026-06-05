import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPostTimestamp,
  getPostCardView,
  normalizePostCard,
} from "../../frontend/src/posts/post-card.mjs";

const createdAt = "2026-06-05T03:00:00.000Z";

test("post card view exposes image, author, caption, and display time", () => {
  const view = getPostCardView(post({ id: "post_1", caption: "A quiet morning" }));

  assert.equal(view.id, "post_1");
  assert.equal(view.imageUrl, "https://example.com/post_1.png");
  assert.equal(view.author.name, "Ada");
  assert.equal(view.caption, "A quiet morning");
  assert.equal(view.hasCaption, true);
  assert.equal(view.imageAlt, "A quiet morning");
  assert.equal(view.displayTime.length > 0, true);
});

test("post card falls back to author-based alt text without a caption", () => {
  const view = getPostCardView(post({ id: "post_1", caption: "" }));

  assert.equal(view.hasCaption, false);
  assert.equal(view.imageAlt, "Post image by Ada");
});

test("post card accepts description as a caption alias", () => {
  const normalized = normalizePostCard({
    id: "post_1",
    imageUrl: "https://example.com/post_1.png",
    description: "From the API",
    createdAt,
    author: {
      id: "user_1",
      name: "Ada",
    },
  });

  assert.equal(normalized.caption, "From the API");
});

test("post card normalizes missing author display fields", () => {
  const normalized = normalizePostCard({
    id: "post_1",
    imageUrl: "https://example.com/post_1.png",
    createdAt,
    author: {
      id: "user_1",
    },
  });

  assert.equal(normalized.author.name, "Unknown user");
  assert.equal(normalized.author.avatarUrl, "");
});

test("post card rejects missing required display data", () => {
  assert.throws(() => normalizePostCard({ imageUrl: "https://example.com/post.png", author: { id: "user_1" } }), /post.id is required/);
  assert.throws(() => normalizePostCard({ id: "post_1", author: { id: "user_1" } }), /post.imageUrl is required/);
  assert.throws(
    () => normalizePostCard({ id: "post_1", imageUrl: "https://example.com/post.png", author: {} }),
    /post.author.id is required/,
  );
  assert.throws(
    () =>
      normalizePostCard({
        id: "post_1",
        imageUrl: "https://example.com/post.png",
        createdAt: "not-a-date",
        author: { id: "user_1" },
      }),
    /post.createdAt must be a valid date/,
  );
});

test("formatPostTimestamp handles invalid dates safely", () => {
  assert.equal(formatPostTimestamp("not-a-date"), "Unknown time");
});

function post({ id, caption }) {
  return {
    id,
    imageUrl: `https://example.com/${id}.png`,
    caption,
    createdAt,
    author: {
      id: "user_1",
      name: "Ada",
      avatarUrl: "https://example.com/ada.png",
    },
  };
}
