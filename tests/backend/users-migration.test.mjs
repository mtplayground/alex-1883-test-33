import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migrationPath = "backend/db/migrations/20260605033500_create_users.sql";
const sql = fs.readFileSync(migrationPath, "utf8");

test("users migration creates the expected PostgreSQL table", () => {
  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS pgcrypto/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS users/i);
  assert.match(sql, /id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/i);
  assert.match(sql, /google_id text NOT NULL/i);
  assert.match(sql, /email text NOT NULL/i);
  assert.match(sql, /name text NOT NULL DEFAULT ''/i);
  assert.match(sql, /avatar_url text NOT NULL DEFAULT ''/i);
  assert.match(sql, /created_at timestamptz NOT NULL DEFAULT now\(\)/i);
  assert.match(sql, /updated_at timestamptz NOT NULL DEFAULT now\(\)/i);
});

test("users migration enforces identity uniqueness and field constraints", () => {
  assert.match(sql, /CONSTRAINT users_google_id_unique UNIQUE \(google_id\)/i);
  assert.match(sql, /CONSTRAINT users_email_unique UNIQUE \(email\)/i);
  assert.match(sql, /CONSTRAINT users_google_id_not_blank CHECK \(char_length\(btrim\(google_id\)\) > 0\)/i);
  assert.match(sql, /CONSTRAINT users_email_not_blank CHECK \(char_length\(btrim\(email\)\) > 0\)/i);
  assert.match(sql, /CONSTRAINT users_name_max_length CHECK \(char_length\(name\) <= 200\)/i);
  assert.match(sql, /CONSTRAINT users_avatar_url_max_length CHECK \(char_length\(avatar_url\) <= 2048\)/i);
});

test("users migration adds lookup indexes", () => {
  assert.match(sql, /CREATE INDEX IF NOT EXISTS users_email_idx\s+ON users \(email\)/i);
});

test("users migration maintains updated_at on updates", () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION set_updated_at\(\)/i);
  assert.match(sql, /DROP TRIGGER IF EXISTS users_set_updated_at ON users/i);
  assert.match(sql, /CREATE TRIGGER users_set_updated_at\s+BEFORE UPDATE ON users\s+FOR EACH ROW\s+EXECUTE FUNCTION set_updated_at\(\)/i);
});

test("users migration is ordered before dependent tables", () => {
  const migrationNames = fs.readdirSync("backend/db/migrations").sort();
  const usersIndex = migrationNames.indexOf("20260605033500_create_users.sql");
  assert.ok(usersIndex < migrationNames.indexOf("20260605034000_create_posts.sql"));
  assert.ok(usersIndex < migrationNames.indexOf("20260605034500_create_comments.sql"));
  assert.ok(usersIndex < migrationNames.indexOf("20260605035100_create_likes.sql"));
  assert.ok(usersIndex < migrationNames.indexOf("20260605040600_create_follows.sql"));
});

test("users migration stays PostgreSQL-only", () => {
  assert.doesNotMatch(sql, /sqlite/i);
  assert.doesNotMatch(sql, /json-file/i);
  assert.doesNotMatch(sql, /in-memory/i);
  assert.doesNotMatch(sql, /ephemeral/i);
});
