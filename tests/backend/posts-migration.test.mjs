import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migrationPath = "backend/db/migrations/20260605034000_create_posts.sql";
const sql = fs.readFileSync(migrationPath, "utf8");

test("posts migration creates the expected PostgreSQL table", () => {
  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS pgcrypto/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS posts/i);
  assert.match(sql, /id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/i);
  assert.match(sql, /author_id uuid NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/i);
  assert.match(sql, /image_url text NOT NULL/i);
  assert.match(sql, /caption text NOT NULL DEFAULT ''/i);
  assert.match(sql, /created_at timestamptz NOT NULL DEFAULT now\(\)/i);
  assert.match(sql, /updated_at timestamptz NOT NULL DEFAULT now\(\)/i);
});

test("posts migration enforces image URL and caption constraints", () => {
  assert.match(sql, /CONSTRAINT posts_image_url_not_blank CHECK \(char_length\(btrim\(image_url\)\) > 0\)/i);
  assert.match(sql, /CONSTRAINT posts_caption_max_length CHECK \(char_length\(caption\) <= 1000\)/i);
});

test("posts migration adds author and feed ordering indexes", () => {
  assert.match(sql, /CREATE INDEX IF NOT EXISTS posts_author_created_at_id_idx\s+ON posts \(author_id, created_at DESC, id DESC\)/i);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS posts_created_at_id_idx\s+ON posts \(created_at DESC, id DESC\)/i);
});

test("posts migration maintains updated_at on updates", () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION set_updated_at\(\)/i);
  assert.match(sql, /DROP TRIGGER IF EXISTS posts_set_updated_at ON posts/i);
  assert.match(sql, /CREATE TRIGGER posts_set_updated_at\s+BEFORE UPDATE ON posts\s+FOR EACH ROW\s+EXECUTE FUNCTION set_updated_at\(\)/i);
});

test("posts migration is ordered before dependent tables", () => {
  const migrationNames = fs.readdirSync("backend/db/migrations").sort();
  assert.ok(migrationNames.indexOf("20260605034000_create_posts.sql") < migrationNames.indexOf("20260605034500_create_comments.sql"));
  assert.ok(migrationNames.indexOf("20260605034000_create_posts.sql") < migrationNames.indexOf("20260605035100_create_likes.sql"));
  assert.ok(migrationNames.indexOf("20260605034000_create_posts.sql") < migrationNames.indexOf("20260605040600_create_follows.sql"));
});

test("posts migration stays PostgreSQL-only", () => {
  assert.doesNotMatch(sql, /sqlite/i);
  assert.doesNotMatch(sql, /json-file/i);
  assert.doesNotMatch(sql, /in-memory/i);
  assert.doesNotMatch(sql, /ephemeral/i);
});
