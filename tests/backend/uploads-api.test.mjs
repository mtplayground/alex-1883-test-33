import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../../scripts/error-response.mjs";
import { createUploadsHandlers, matchUploadsRoute } from "../../backend/src/uploads/uploads-routes.mjs";
import {
  MAX_IMAGE_BYTES,
  createS3ImageStorage,
  createUploadsService,
  normalizeImageInput,
  readObjectStorageConfig,
  withStoragePrefix,
} from "../../backend/src/uploads/uploads-service.mjs";

const png = Buffer.from("89504e470d0a1a0a", "hex");

test("matchUploadsRoute maps the image upload REST route", () => {
  assert.deepEqual(matchUploadsRoute("POST", "/uploads/images"), {
    action: "uploadImage",
    params: {},
  });
  assert.deepEqual(matchUploadsRoute("POST", "/uploads/images/"), {
    action: "uploadImage",
    params: {},
  });
  assert.equal(matchUploadsRoute("GET", "/uploads/images"), null);
});

test("uploads service validates images and stores buffered bodies", async () => {
  const calls = [];
  const service = createUploadsService({
    keyFactory(file) {
      assert.equal(file.contentType, "image/png");
      assert.equal(file.buffer.byteLength, png.byteLength);
      return "images/test.png";
    },
    storage: {
      async putImage(input) {
        calls.push(input);
        return {
          key: `uploads/${input.key}`,
          url: "https://cdn.example.com/uploads/images/test.png",
        };
      },
    },
  });

  const result = await service.uploadImage({
    file: {
      buffer: png,
      contentType: "image/png",
      originalName: "pixel.png",
    },
  });

  assert.equal(result.imageUrl, "https://cdn.example.com/uploads/images/test.png");
  assert.equal(result.url, result.imageUrl);
  assert.equal(result.key, "uploads/images/test.png");
  assert.equal(result.contentType, "image/png");
  assert.equal(result.size, png.byteLength);
  assert.deepEqual(calls, [
    {
      key: "images/test.png",
      body: png,
      contentType: "image/png",
      contentLength: png.byteLength,
    },
  ]);
});

test("normalizeImageInput rejects missing, unsupported, and oversized images", async () => {
  await assert.rejects(normalizeImageInput({ contentType: "image/png", buffer: Buffer.alloc(0) }), /Image file is required/);
  await assert.rejects(normalizeImageInput({ contentType: "text/plain", buffer: Buffer.from("x") }), /Unsupported image type/);
  await assert.rejects(
    normalizeImageInput({ contentType: "image/png", buffer: Buffer.alloc(MAX_IMAGE_BYTES + 1) }),
    /Image file is too large/,
  );
});

test("S3 image storage prepends OBJECT_STORAGE_PREFIX and sends concrete ContentLength", async () => {
  const sends = [];
  class FakePutObjectCommand {
    constructor(input) {
      this.input = input;
    }
  }

  const storage = createS3ImageStorage({
    env: storageEnv(),
    PutObjectCommand: FakePutObjectCommand,
    s3Client: {
      async send(command) {
        sends.push(command.input);
      },
    },
  });

  const result = await storage.putImage({
    key: "images/test.png",
    body: png,
    contentType: "image/png",
    contentLength: png.byteLength,
  });

  assert.equal(result.key, "app-uploads/images/test.png");
  assert.equal(result.url, "https://cdn.example.com/app-uploads/images/test.png");
  assert.deepEqual(sends, [
    {
      Bucket: "media-bucket",
      Key: "app-uploads/images/test.png",
      Body: png,
      ContentType: "image/png",
      ContentLength: png.byteLength,
    },
  ]);
});

test("S3 image storage rejects missing or mismatched ContentLength before upload", async () => {
  const storage = createS3ImageStorage({
    env: storageEnv(),
    PutObjectCommand: class {},
    s3Client: {
      async send() {
        throw new Error("send should not be called");
      },
    },
  });

  await assert.rejects(
    storage.putImage({
      key: "images/test.png",
      body: png,
      contentType: "image/png",
      contentLength: undefined,
    }),
    /ContentLength must match/,
  );
  await assert.rejects(
    storage.putImage({
      key: "images/test.png",
      body: png,
      contentType: "image/png",
      contentLength: png.byteLength + 1,
    }),
    /ContentLength must match/,
  );
});

test("object storage config requires valid environment and sanitized prefixes", () => {
  assert.deepEqual(readObjectStorageConfig(storageEnv()).prefix, "app-uploads");
  assert.equal(withStoragePrefix("app-uploads", "/images/test.png"), "app-uploads/images/test.png");
  assert.throws(() => withStoragePrefix("app-uploads", "../escape.png"), /Invalid object key/);
  assert.throws(() => readObjectStorageConfig({ ...storageEnv(), OBJECT_STORAGE_PREFIX: "../bad" }), /OBJECT_STORAGE_PREFIX is invalid/);
  assert.throws(() => readObjectStorageConfig({ ...storageEnv(), OBJECT_STORAGE_BUCKET: "" }), /OBJECT_STORAGE_BUCKET is required/);
});

test("uploads handlers return REST responses and require auth", async () => {
  const calls = [];
  const handlers = createUploadsHandlers({
    uploadsService: {
      async uploadImage(input) {
        calls.push(input);
        return {
          imageUrl: "https://cdn.example.com/app-uploads/images/test.png",
          url: "https://cdn.example.com/app-uploads/images/test.png",
          key: "app-uploads/images/test.png",
        };
      },
    },
  });

  const created = await handlers.handle({
    method: "POST",
    path: "/uploads/images",
    user: { id: "user_1" },
    file: {
      buffer: png,
      contentType: "image/png",
      originalName: "pixel.png",
    },
    requestId: "req_1",
  });

  assert.equal(created.status, 201);
  assert.equal(created.body.imageUrl, "https://cdn.example.com/app-uploads/images/test.png");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].contentType, "image/png");

  const unauthenticated = await handlers.handle({
    method: "POST",
    path: "/uploads/images",
    file: { buffer: png, contentType: "image/png" },
    requestId: "req_2",
  });
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.body.error.code, "UNAUTHENTICATED");
});

test("uploads handlers log unexpected errors before returning generic 500", async () => {
  const logs = [];
  const handlers = createUploadsHandlers({
    uploadsService: {
      async uploadImage() {
        throw Object.assign(new Error("object storage unavailable"), { code: "ECONNRESET" });
      },
    },
    logger: {
      error(message, metadata) {
        logs.push({ message, metadata });
      },
    },
  });

  const response = await handlers.handle({
    method: "POST",
    path: "/uploads/images",
    user: { id: "user_1" },
    file: { buffer: png, contentType: "image/png" },
    requestId: "req_3",
  });

  assert.equal(response.status, 500);
  assert.equal(response.body.error.code, "INTERNAL_SERVER_ERROR");
  assert.equal(logs[0].message, "Unhandled application error");
  assert.equal(logs[0].metadata.name, "Error");
  assert.equal(logs[0].metadata.code, "ECONNRESET");
  assert.equal(logs[0].metadata.message, "object storage unavailable");
  assert.match(logs[0].metadata.stack, /object storage unavailable/);
});

test("uploads handlers preserve ApiError envelopes without logging", async () => {
  const logs = [];
  const handlers = createUploadsHandlers({
    uploadsService: {
      async uploadImage() {
        throw new ApiError(400, "VALIDATION_ERROR", "Unsupported image type");
      },
    },
    logger: {
      error(message, metadata) {
        logs.push({ message, metadata });
      },
    },
  });

  const response = await handlers.handle({
    method: "POST",
    path: "/uploads/images",
    user: { id: "user_1" },
    file: { buffer: Buffer.from("x"), contentType: "text/plain" },
    requestId: "req_4",
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
  assert.deepEqual(logs, []);
});

function storageEnv() {
  return {
    OBJECT_STORAGE_ENDPOINT: "https://s3.example.com",
    OBJECT_STORAGE_REGION: "auto",
    OBJECT_STORAGE_BUCKET: "media-bucket",
    OBJECT_STORAGE_ACCESS_KEY_ID: "access-key",
    OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret-key",
    OBJECT_STORAGE_PREFIX: "app-uploads",
    OBJECT_STORAGE_PUBLIC_BASE_URL: "https://cdn.example.com",
  };
}
