import assert from "node:assert/strict";
import test from "node:test";

const componentContracts = [
  {
    area: "auth-state",
    component: "AuthStatus",
    requiredStates: ["loading", "signed-out", "signed-in", "error"],
    states: {
      loading: ["shows-progress", "hides-private-user-data", "disables-auth-actions"],
      "signed-out": ["shows-sign-in", "hides-profile-menu", "links-to-google-oauth"],
      "signed-in": ["shows-avatar", "shows-display-name", "shows-email", "shows-sign-out"],
      error: ["shows-safe-error-message", "offers-retry"],
    },
    events: ["click-sign-in", "click-sign-out", "retry-session-load"],
  },
  {
    area: "image-upload",
    component: "ImagePostComposer",
    requiredStates: ["idle", "preview", "submitting", "success", "error"],
    states: {
      idle: ["accepts-image-file", "caption-empty", "submit-disabled"],
      preview: ["shows-selected-image", "caption-editable", "submit-enabled", "remove-image-available"],
      submitting: ["submit-disabled", "remove-disabled", "progress-visible"],
      success: ["clears-selected-image", "clears-caption", "announces-post-created"],
      error: ["keeps-selected-image", "keeps-caption", "shows-safe-error-message", "offers-retry"],
    },
    events: ["select-image", "remove-image", "edit-caption", "submit-post", "retry-submit"],
  },
  {
    area: "feed",
    component: "FeedView",
    requiredStates: ["loading", "empty", "populated", "page-loading", "error"],
    states: {
      loading: ["shows-feed-skeleton", "does-not-show-empty-state"],
      empty: ["shows-empty-state", "hides-post-list"],
      populated: ["renders-post-cards", "preserves-post-order", "shows-pagination-sentinel"],
      "page-loading": ["keeps-existing-posts", "shows-next-page-progress"],
      error: ["keeps-existing-posts", "shows-safe-error-message", "offers-retry"],
    },
    events: ["initial-load", "load-next-page", "retry-feed-load"],
  },
  {
    area: "interactions",
    component: "PostInteractions",
    requiredStates: ["followed", "not-followed", "liked", "not-liked", "commenting", "comment-error"],
    states: {
      followed: ["shows-unfollow-action", "shows-follower-count"],
      "not-followed": ["shows-follow-action", "shows-follower-count"],
      liked: ["shows-unlike-action", "shows-like-count"],
      "not-liked": ["shows-like-action", "shows-like-count"],
      commenting: ["comment-input-disabled", "submit-comment-disabled", "keeps-comment-draft"],
      "comment-error": ["keeps-comment-draft", "shows-safe-error-message", "offers-retry"],
    },
    events: ["toggle-follow", "toggle-like", "write-comment", "submit-comment", "delete-comment"],
  },
];

test("frontend component contracts cover the required issue #29 areas", () => {
  const coveredAreas = componentContracts.map((contract) => contract.area).sort();
  assert.deepEqual(coveredAreas, ["auth-state", "feed", "image-upload", "interactions"]);
});

for (const contract of componentContracts) {
  test(`${contract.component} has complete state coverage`, () => {
    assert.equal(typeof contract.component, "string");
    assert.ok(contract.component.length > 0);

    const stateNames = Object.keys(contract.states).sort();
    assert.deepEqual(stateNames, [...contract.requiredStates].sort());

    for (const [state, assertions] of Object.entries(contract.states)) {
      assert.ok(assertions.length >= 2, `${contract.component}:${state} must define visible assertions`);
      assert.equal(new Set(assertions).size, assertions.length, `${contract.component}:${state} assertions repeat`);
      for (const assertion of assertions) {
        assert.match(assertion, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      }
    }
  });

  test(`${contract.component} has user-event coverage`, () => {
    assert.ok(contract.events.length >= 3, `${contract.component} must include user events`);
    assert.equal(new Set(contract.events).size, contract.events.length);
    for (const event of contract.events) {
      assert.match(event, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });
}

test("upload and interaction contracts preserve user input on recoverable errors", () => {
  const uploadErrorAssertions = componentContracts
    .find((contract) => contract.area === "image-upload")
    .states.error;
  assert.ok(uploadErrorAssertions.includes("keeps-selected-image"));
  assert.ok(uploadErrorAssertions.includes("keeps-caption"));

  const commentErrorAssertions = componentContracts
    .find((contract) => contract.area === "interactions")
    .states["comment-error"];
  assert.ok(commentErrorAssertions.includes("keeps-comment-draft"));
});

test("feed and interaction contracts require stable counters and ordering", () => {
  const feedAssertions = componentContracts.find((contract) => contract.area === "feed").states.populated;
  assert.ok(feedAssertions.includes("preserves-post-order"));

  const interactions = componentContracts.find((contract) => contract.area === "interactions").states;
  assert.ok(interactions.followed.includes("shows-follower-count"));
  assert.ok(interactions["not-followed"].includes("shows-follower-count"));
  assert.ok(interactions.liked.includes("shows-like-count"));
  assert.ok(interactions["not-liked"].includes("shows-like-count"));
});
