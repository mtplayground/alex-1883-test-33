import assert from "node:assert/strict";
import test from "node:test";
import {
  createPostDetailState,
  getPostDetailView,
  normalizePostDetail,
} from "../../frontend/src/posts/post-detail-page.mjs";

const createdAt = "2026-06-05T03:00:00.000Z";

test("post detail normalizes post, comments, like state, and author follow state", () => {
  const detail = normalizePostDetail({
    post: post({
      comments: [comment("comment_1")],
      isLiked: true,
      likeCount: 4,
    }),
    authorStats: {
      followerCount: 12,
      followingCount: 3,
    },
    followState: {
      isFollowing: true,
    },
  });

  assert.equal(detail.post.id, "post_1");
  assert.equal(detail.post.author.name, "Ada");
  assert.equal(detail.comments[0].id, "comment_1");
  assert.equal(detail.likeCount, 4);
  assert.equal(detail.isLiked, true);
  assert.equal(detail.followerCount, 12);
  assert.equal(detail.followingCount, 3);
  assert.equal(detail.isFollowing, true);
});

test("post detail accepts common API envelopes and aliases", () => {
  const detail = normalizePostDetail({
    data: {
      post: {
        id: "post_2",
        imageUrl: "https://example.com/post_2.png",
        description: "Alias caption",
        createdAt,
        author: {
          id: "user_2",
          name: "Grace",
        },
        likeCount: 2,
        isLiked: false,
        followerCount: 8,
        followingCount: 5,
        isFollowing: true,
        comments: [comment("comment_2")],
      },
    },
  });

  assert.equal(detail.post.id, "post_2");
  assert.equal(detail.post.caption, "Alias caption");
  assert.equal(detail.comments.length, 1);
  assert.equal(detail.likeCount, 2);
  assert.equal(detail.followerCount, 8);
  assert.equal(detail.followingCount, 5);
  assert.equal(detail.isFollowing, true);
});

test("post detail state exposes a view for assembled widgets", () => {
  const state = createPostDetailState({
    postId: "post_1",
    currentUser: { id: "viewer_1" },
    postDetail: {
      post: post({ comments: [comment("comment_1")], isLiked: true, likeCount: 1 }),
      authorStats: { followerCount: 2, followingCount: 7 },
      followState: { isFollowing: false },
    },
  });
  const view = getPostDetailView(state);

  assert.equal(view.hasPost, true);
  assert.equal(view.post.id, "post_1");
  assert.equal(view.author.id, "user_1");
  assert.equal(view.comments.length, 1);
  assert.equal(view.likeCount, 1);
  assert.equal(view.isLiked, true);
  assert.equal(view.followerCount, 2);
  assert.equal(view.followingCount, 7);
  assert.equal(view.isFollowing, false);
});

test("post detail rejects missing required data", () => {
  assert.throws(() => createPostDetailState({}), /postId is required/);
  assert.throws(
    () => normalizePostDetail({ post: { imageUrl: "https://example.com/post.png" } }),
    /post.id is required/,
  );
});

function post({ id = "post_1", comments = [], isLiked = false, likeCount = 0 }) {
  return {
    id,
    imageUrl: `https://example.com/${id}.png`,
    caption: "Golden hour",
    createdAt,
    comments,
    isLiked,
    likeCount,
    author: {
      id: "user_1",
      name: "Ada",
      avatarUrl: "https://example.com/ada.png",
    },
  };
}

function comment(id) {
  return {
    id,
    content: "Beautiful light",
    createdAt,
    author: {
      id: "user_3",
      name: "Lin",
      avatarUrl: "",
    },
  };
}
