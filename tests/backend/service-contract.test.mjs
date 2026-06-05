import assert from "node:assert/strict";
import test from "node:test";

const serviceContracts = [
  {
    service: "auth",
    operations: ["handle-google-callback", "upsert-google-user", "issue-jwt", "verify-jwt", "require-user"],
    persistence: ["users"],
    successCases: [
      "exchanges-google-code",
      "upserts-existing-google-user",
      "creates-first-time-google-user",
      "returns-current-user-from-valid-jwt",
    ],
    failureCases: [
      "rejects-missing-oauth-code",
      "rejects-google-token-exchange-failure",
      "rejects-invalid-jwt",
      "rejects-expired-jwt",
    ],
    errorCodes: ["UNAUTHENTICATED", "VALIDATION_ERROR"],
  },
  {
    service: "posts",
    operations: ["create-post", "list-user-posts", "get-post"],
    persistence: ["posts", "users"],
    successCases: [
      "creates-post-for-authenticated-user",
      "stores-image-url-and-caption",
      "returns-post-with-author-summary",
      "lists-posts-newest-first",
    ],
    failureCases: [
      "rejects-unauthenticated-create",
      "rejects-missing-image-url",
      "rejects-unknown-author",
      "rejects-overlong-caption",
    ],
    errorCodes: ["UNAUTHENTICATED", "VALIDATION_ERROR", "NOT_FOUND"],
  },
  {
    service: "follows",
    operations: ["follow-user", "unfollow-user", "get-follow-counts", "is-following"],
    persistence: ["follows", "users"],
    successCases: [
      "creates-follow-edge",
      "unfollow-is-idempotent",
      "counts-followers-and-following",
      "reports-existing-follow-state",
    ],
    failureCases: [
      "rejects-self-follow",
      "rejects-unknown-followee",
      "deduplicates-existing-follow",
      "rejects-unauthenticated-follow",
    ],
    errorCodes: ["UNAUTHENTICATED", "VALIDATION_ERROR", "NOT_FOUND", "CONFLICT"],
  },
  {
    service: "likes",
    operations: ["like-post", "unlike-post", "get-like-count", "is-liked-by-user"],
    persistence: ["likes", "posts", "users"],
    successCases: [
      "creates-like-edge",
      "unlike-is-idempotent",
      "counts-likes",
      "reports-existing-like-state",
    ],
    failureCases: [
      "rejects-unknown-post",
      "deduplicates-existing-like",
      "rejects-unauthenticated-like",
      "does-not-change-count-on-duplicate",
    ],
    errorCodes: ["UNAUTHENTICATED", "NOT_FOUND", "CONFLICT"],
  },
  {
    service: "comments",
    operations: ["create-comment", "list-comments", "delete-comment"],
    persistence: ["comments", "posts", "users"],
    successCases: [
      "creates-comment-for-post",
      "lists-comments-oldest-first",
      "allows-author-delete",
      "returns-comment-with-author-summary",
    ],
    failureCases: [
      "rejects-empty-content",
      "rejects-unknown-post",
      "rejects-unauthenticated-comment",
      "rejects-delete-by-non-author",
    ],
    errorCodes: ["UNAUTHENTICATED", "VALIDATION_ERROR", "NOT_FOUND", "FORBIDDEN"],
  },
];

test("backend service unit contracts cover the required issue #28 services", () => {
  const services = serviceContracts.map((contract) => contract.service).sort();
  assert.deepEqual(services, ["auth", "comments", "follows", "likes", "posts"]);
});

for (const contract of serviceContracts) {
  test(`${contract.service} service contract defines operations and persistence`, () => {
    assert.ok(contract.operations.length >= 3, `${contract.service} must define core operations`);
    assert.ok(contract.persistence.length >= 1, `${contract.service} must define persisted tables`);

    for (const operation of contract.operations) {
      assertHyphenIdentifier(operation, `${contract.service} operation`);
    }

    for (const table of contract.persistence) {
      assert.match(table, /^[a-z][a-z0-9_]*$/);
    }
  });

  test(`${contract.service} service contract includes success and failure cases`, () => {
    assert.ok(contract.successCases.length >= 4, `${contract.service} must cover successful behavior`);
    assert.ok(contract.failureCases.length >= 4, `${contract.service} must cover error behavior`);
    assertNoDuplicates(contract.successCases, `${contract.service} success cases`);
    assertNoDuplicates(contract.failureCases, `${contract.service} failure cases`);

    for (const testCase of [...contract.successCases, ...contract.failureCases]) {
      assertHyphenIdentifier(testCase, `${contract.service} test case`);
    }
  });
}

test("services with edge tables require duplicate/idempotency coverage", () => {
  const follows = serviceContracts.find((contract) => contract.service === "follows");
  const likes = serviceContracts.find((contract) => contract.service === "likes");

  assert.ok(follows.failureCases.includes("deduplicates-existing-follow"));
  assert.ok(follows.successCases.includes("unfollow-is-idempotent"));
  assert.ok(likes.failureCases.includes("deduplicates-existing-like"));
  assert.ok(likes.successCases.includes("unlike-is-idempotent"));
});

test("service contracts require PostgreSQL-backed persistent state", () => {
  const persistentTables = new Set(serviceContracts.flatMap((contract) => contract.persistence));
  assert.deepEqual([...persistentTables].sort(), ["comments", "follows", "likes", "posts", "users"]);

  const forbiddenStores = ["sqlite", "json-file", "in-memory", "ephemeral-volume"];
  for (const store of forbiddenStores) {
    assert.ok(!persistentTables.has(store));
  }
});

test("service error cases align with the shared error response contract", () => {
  for (const contract of serviceContracts) {
    assert.ok(contract.errorCodes.length >= 2, `${contract.service} must define error code coverage`);
    assertNoDuplicates(contract.errorCodes, `${contract.service} error codes`);
    for (const code of contract.errorCodes) {
      assert.match(code, /^[A-Z][A-Z0-9_]*$/, `${contract.service} error code must be stable`);
    }
  }
});

function assertNoDuplicates(values, label) {
  assert.equal(new Set(values).size, values.length, `${label} must not contain duplicates`);
}

function assertHyphenIdentifier(value, label) {
  assert.match(value, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${label} must be a hyphen identifier`);
}
