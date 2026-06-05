import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migrationPath = "backend/db/migrations/20260605034500_create_comments.sql";
const sql = fs.readFileSync(migrationPath, "utf8");

test("comments migration creates the expected PostgreSQL table", () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS comments/i);
  assert.match(sql, /id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/i);
  assert.match(sql, /post_id uuid NOT NULL REFERENCES posts\(id\) ON DELETE CASCADE/i);
  assert.match(sql, /author_id uuid NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/i);
  assert.match(sql, /content text NOT NULL/i);
  assert.match(sql, /created_at timestamptz NOT NULL DEFAULT now\(\)/i);
  assert.match(sql, /updated_at timestamptz NOT NULL DEFAULT now\(\)/i);
});

test("comments migration enforces content constraints", () => {
  assert.match(sql, /comments_content_not_blank CHECK \(char_length\(btrim\(content\)\) > 0\)/i);
  assert.match(sql, /comments_content_max_length CHECK \(char_length\(content\) <= 1000\)/i);
});

test("comments migration adds query-path indexes", () => {
  assert.match(sql, /CREATE INDEX IF NOT EXISTS comments_post_created_at_id_idx\s+ON comments \(post_id, created_at, id\)/i);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS comments_author_id_idx\s+ON comments \(author_id\)/i);
});

test("comments migration maintains updated_at on updates", () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION set_updated_at\(\)/i);
  assert.match(sql, /DROP TRIGGER IF EXISTS comments_set_updated_at ON comments/i);
  assert.match(sql, /CREATE TRIGGER comments_set_updated_at\s+BEFORE UPDATE ON comments/i);
  assert.match(sql, /EXECUTE FUNCTION set_updated_at\(\)/i);
});

test("comments migration stays PostgreSQL-only", () => {
  assert.doesNotMatch(sql, /sqlite/i);
  assert.doesNotMatch(sql, /json-file/i);
  assert.doesNotMatch(sql, /in-memory/i);
  assert.doesNotMatch(sql, /ephemeral/i);
});
