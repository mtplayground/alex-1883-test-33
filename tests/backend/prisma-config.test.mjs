import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ApiError } from "../../scripts/error-response.mjs";
import { createPrismaClient, readPrismaDatabaseUrl } from "../../backend/src/db/prisma-client.mjs";

const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
const migration = fs.readFileSync("prisma/migrations/20260605033500_initial/migration.sql", "utf8");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

test("Prisma schema is configured for managed PostgreSQL through DATABASE_URL", () => {
  assert.match(schema, /datasource\s+db\s+\{[\s\S]*provider\s*=\s*"postgresql"[\s\S]*url\s*=\s*env\("DATABASE_URL"\)/);
  assert.doesNotMatch(schema, /sqlite|file:/i);
  assert.match(schema, /generator\s+client\s+\{[\s\S]*provider\s*=\s*"prisma-client"[\s\S]*output\s*=\s*"\.\.\/backend\/src\/generated\/prisma"/);
});

test("Prisma schema maps the current PostgreSQL tables and relations", () => {
  for (const model of ["User", "Post", "Comment", "Like", "Follow"]) {
    assert.ok(schema.includes(`model ${model} {`), `${model} model must be present`);
  }

  for (const table of ["users", "posts", "comments", "likes", "follows"]) {
    assert.ok(schema.includes(`@@map("${table}")`), `${table} table mapping must be present`);
  }

  assert.match(schema, /@default\(dbgenerated\("gen_random_uuid\(\)"\)\) @db\.Uuid/);
  assert.match(schema, /onDelete: Cascade/);
  assert.match(schema, /@@unique\(\[userId, postId\], map: "likes_user_post_unique"\)/);
  assert.match(schema, /@@unique\(\[followerId, followeeId\], map: "follows_follower_followee_unique"\)/);
});

test("Prisma migration baseline creates PostgreSQL schema without forbidden stores", () => {
  assert.match(migration, /CREATE EXTENSION IF NOT EXISTS pgcrypto;/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS users/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS posts/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS comments/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS likes/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS follows/);
  assert.match(migration, /REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.match(migration, /CREATE TRIGGER users_set_updated_at/);
  assert.doesNotMatch(migration, /sqlite|json-file|in-memory|ephemeral/i);
});

test("package scripts expose Prisma generate and migration workflows", () => {
  assert.equal(packageJson.dependencies["@prisma/client"], "^7.4.1");
  assert.equal(packageJson.devDependencies.prisma, "^7.4.1");
  assert.equal(packageJson.scripts["prisma:generate"], "prisma generate --schema prisma/schema.prisma");
  assert.equal(packageJson.scripts["prisma:validate"], "prisma validate --schema prisma/schema.prisma");
  assert.equal(packageJson.scripts["db:migrate"], "prisma migrate deploy --schema prisma/schema.prisma");
  assert.equal(packageJson.scripts["db:migrate:dev"], "prisma migrate dev --schema prisma/schema.prisma");
});

test("Prisma client factory validates DATABASE_URL and passes it to the datasource", async () => {
  const created = [];
  class FakePrismaClient {
    constructor(options) {
      created.push(options);
    }
  }

  const client = await createPrismaClient({
    env: {
      DATABASE_URL: "postgresql://user:password@db.example.com:5432/app?sslmode=require",
    },
    PrismaClient: FakePrismaClient,
  });

  assert.ok(client instanceof FakePrismaClient);
  assert.deepEqual(created, [
    {
      datasources: {
        db: {
          url: "postgresql://user:password@db.example.com:5432/app?sslmode=require",
        },
      },
    },
  ]);

  assert.equal(
    readPrismaDatabaseUrl({ DATABASE_URL: "postgres://user:password@db.example.com:5432/app" }),
    "postgres://user:password@db.example.com:5432/app",
  );
});

test("Prisma client factory rejects missing, non-URL, and non-PostgreSQL database URLs", () => {
  for (const env of [
    {},
    { DATABASE_URL: "not-a-url" },
    { DATABASE_URL: "sqlite://local.db" },
  ]) {
    assert.throws(
      () => readPrismaDatabaseUrl(env),
      (error) => error instanceof ApiError && error.status === 500 && error.code === "CONFIGURATION_ERROR",
    );
  }
});
