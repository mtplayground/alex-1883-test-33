import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { APP_ROUTES } from "../../frontend/src/app-routes.mjs";

test("app route table defines the required issue #63 routes", () => {
  assert.deepEqual(
    APP_ROUTES.map((route) => route.path),
    ["/", "/feed", "/profile", "/post/:id", "/auth/callback"],
  );
});

test("app shell no longer contains the scaffold Ready landing card", async () => {
  const source = await readFile(new URL("../../frontend/src/App.mjs", import.meta.url), "utf8");

  assert.doesNotMatch(source, /React frontend scaffold/);
  assert.doesNotMatch(source, /Frontend and backend projects are wired with separate start scripts/);
  assert.doesNotMatch(source, /React\.createElement\("h2", null, "Ready"\)/);
});
