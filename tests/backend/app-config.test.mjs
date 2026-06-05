import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ApiError } from "../../scripts/error-response.mjs";
import {
  APP_CONFIG_SCHEMA,
  readAppConfig,
  validateAppEnv,
} from "../../backend/src/config/app-config.mjs";

const expectedVariables = [
  "NODE_ENV",
  "HOST",
  "PORT",
  "PUBLIC_APP_URL",
  "DATABASE_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "GOOGLE_OAUTH_SCOPES",
  "JWT_SECRET",
  "JWT_ISSUER",
  "JWT_AUDIENCE",
  "JWT_EXPIRES_IN_SECONDS",
  "OBJECT_STORAGE_ENDPOINT",
  "OBJECT_STORAGE_REGION",
  "OBJECT_STORAGE_BUCKET",
  "OBJECT_STORAGE_ACCESS_KEY_ID",
  "OBJECT_STORAGE_SECRET_ACCESS_KEY",
  "OBJECT_STORAGE_PREFIX",
  "OBJECT_STORAGE_PUBLIC_BASE_URL",
];

test("app config schema centralizes runtime, database, storage, Google OAuth, and JWT variables", () => {
  assert.deepEqual(APP_CONFIG_SCHEMA.map((entry) => entry.name), expectedVariables);
  assert.deepEqual(new Set(APP_CONFIG_SCHEMA.map((entry) => entry.group)), new Set([
    "runtime",
    "database",
    "googleOAuth",
    "jwt",
    "objectStorage",
  ]));
  for (const entry of APP_CONFIG_SCHEMA) {
    assert.equal(typeof entry.validate, "function", `${entry.name} must have a validator`);
  }
});

test(".env.example documents every centralized config variable", () => {
  const envExample = parseEnvExample(".env.example");
  assert.deepEqual(Object.keys(envExample), expectedVariables);
  assert.match(envExample.DATABASE_URL, /^postgresql:\/\//);
  assert.equal(envExample.HOST, "0.0.0.0");
  assert.equal(envExample.PORT, "8080");
  assert.equal(envExample.GOOGLE_OAUTH_SCOPES, "openid email profile");
  assert.equal(envExample.JWT_EXPIRES_IN_SECONDS, "604800");
  assert.equal(envExample.OBJECT_STORAGE_PREFIX, "uploads");
});

test("readAppConfig returns typed nested config and applies defaults", () => {
  const config = readAppConfig({
    PUBLIC_APP_URL: "https://app.example.com",
    DATABASE_URL: "postgresql://user:password@db.example.com:5432/app?sslmode=require",
    GOOGLE_CLIENT_ID: "google-client",
    GOOGLE_CLIENT_SECRET: "google-secret",
    GOOGLE_REDIRECT_URI: "https://app.example.com/auth/callback",
    JWT_SECRET: "0123456789abcdef0123456789abcdef",
    OBJECT_STORAGE_ENDPOINT: "https://s3.example.com",
    OBJECT_STORAGE_REGION: "auto",
    OBJECT_STORAGE_BUCKET: "media-bucket",
    OBJECT_STORAGE_ACCESS_KEY_ID: "access-key",
    OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret-key",
    OBJECT_STORAGE_PREFIX: "uploads",
  });

  assert.deepEqual(config.runtime, {
    nodeEnv: "production",
    host: "0.0.0.0",
    port: 8080,
    publicAppUrl: "https://app.example.com",
  });
  assert.equal(config.database.url, "postgresql://user:password@db.example.com:5432/app?sslmode=require");
  assert.deepEqual(config.googleOAuth.scopes, ["openid", "email", "profile"]);
  assert.equal(config.jwt.issuer, "alex-1883-test-33");
  assert.equal(config.jwt.audience, "alex-1883-test-33:web");
  assert.equal(config.jwt.expiresInSeconds, 604800);
  assert.equal(config.objectStorage.publicBaseUrl, "");
});

test("app config validates required values and provider-specific formats", () => {
  const missing = validateAppEnv({});
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some((error) => error.name === "DATABASE_URL" && error.message === "is required"));
  assert.ok(missing.errors.some((error) => error.name === "JWT_SECRET" && error.message === "is required"));

  const invalid = validateAppEnv({
    ...validEnv(),
    DATABASE_URL: "sqlite://local.db",
    JWT_SECRET: "too-short",
    OBJECT_STORAGE_PREFIX: "../bad",
    GOOGLE_OAUTH_SCOPES: "email profile",
  });
  assert.deepEqual(
    invalid.errors.map((error) => error.name).sort(),
    ["DATABASE_URL", "GOOGLE_OAUTH_SCOPES", "JWT_SECRET", "OBJECT_STORAGE_PREFIX"],
  );

  assert.throws(
    () => readAppConfig({ ...validEnv(), PORT: "70000" }),
    (error) =>
      error instanceof ApiError &&
      error.status === 500 &&
      error.code === "CONFIGURATION_ERROR" &&
      error.details.errors.some((detail) => detail.name === "PORT"),
  );
});

function validEnv() {
  return {
    NODE_ENV: "production",
    HOST: "0.0.0.0",
    PORT: "8080",
    PUBLIC_APP_URL: "https://app.example.com",
    DATABASE_URL: "postgresql://user:password@db.example.com:5432/app?sslmode=require",
    GOOGLE_CLIENT_ID: "google-client",
    GOOGLE_CLIENT_SECRET: "google-secret",
    GOOGLE_REDIRECT_URI: "https://app.example.com/auth/callback",
    GOOGLE_OAUTH_SCOPES: "openid email profile",
    JWT_SECRET: "0123456789abcdef0123456789abcdef",
    JWT_ISSUER: "alex-1883-test-33",
    JWT_AUDIENCE: "alex-1883-test-33:web",
    JWT_EXPIRES_IN_SECONDS: "604800",
    OBJECT_STORAGE_ENDPOINT: "https://s3.example.com",
    OBJECT_STORAGE_REGION: "auto",
    OBJECT_STORAGE_BUCKET: "media-bucket",
    OBJECT_STORAGE_ACCESS_KEY_ID: "access-key",
    OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret-key",
    OBJECT_STORAGE_PREFIX: "uploads",
    OBJECT_STORAGE_PUBLIC_BASE_URL: "https://cdn.example.com",
  };
}

function parseEnvExample(path) {
  const result = {};
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    result[trimmed.slice(0, separatorIndex)] = trimmed.slice(separatorIndex + 1);
  }
  return result;
}
