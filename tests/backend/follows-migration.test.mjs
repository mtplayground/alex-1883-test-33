import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migrationPath = "backend/db/migrations/20260605040600_create_follows.sql";
const sql = fs.readFileSync(migrationPath, "utf8");

test("follows migration creates the expected PostgreSQL table", () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS follows/i);
  assert.match(sql, /follower_id uuid NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/i);
  assert.match(sql, /followee_id uuid NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/i);
  assert.match(sql, /created_at timestamptz NOT NULL DEFAULT now\(\)/i);
});

test("follows migration enforces one edge per follower and followee", () => {
  assert.match(sql, /CONSTRAINT follows_follower_followee_unique UNIQUE \(follower_id, followee_id\)/i);
});

test("follows migration prevents self-follow edges", () => {
  assert.match(sql, /CONSTRAINT follows_no_self_follow CHECK \(follower_id <> followee_id\)/i);
});

test("follows migration adds count and feed lookup indexes", () => {
  assert.match(sql, /CREATE INDEX IF NOT EXISTS follows_followee_id_idx\s+ON follows \(followee_id\)/i);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS follows_follower_id_idx\s+ON follows \(follower_id\)/i);
});

test("follows migration stays PostgreSQL-only", () => {
  assert.doesNotMatch(sql, /sqlite/i);
  assert.doesNotMatch(sql, /json-file/i);
  assert.doesNotMatch(sql, /in-memory/i);
  assert.doesNotMatch(sql, /ephemeral/i);
});
