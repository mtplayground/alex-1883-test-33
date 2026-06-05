import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migrationPath = "backend/db/migrations/20260605035100_create_likes.sql";
const sql = fs.readFileSync(migrationPath, "utf8");

test("likes migration creates the expected PostgreSQL table", () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS likes/i);
  assert.match(sql, /user_id uuid NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/i);
  assert.match(sql, /post_id uuid NOT NULL REFERENCES posts\(id\) ON DELETE CASCADE/i);
  assert.match(sql, /created_at timestamptz NOT NULL DEFAULT now\(\)/i);
});

test("likes migration enforces one like per user and post", () => {
  assert.match(sql, /CONSTRAINT likes_user_post_unique UNIQUE \(user_id, post_id\)/i);
});

test("likes migration adds count and user lookup indexes", () => {
  assert.match(sql, /CREATE INDEX IF NOT EXISTS likes_post_id_idx\s+ON likes \(post_id\)/i);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS likes_user_id_idx\s+ON likes \(user_id\)/i);
});

test("likes migration stays PostgreSQL-only", () => {
  assert.doesNotMatch(sql, /sqlite/i);
  assert.doesNotMatch(sql, /json-file/i);
  assert.doesNotMatch(sql, /in-memory/i);
  assert.doesNotMatch(sql, /ephemeral/i);
});
