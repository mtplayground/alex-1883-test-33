import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../../scripts/error-response.mjs";
import {
  createObjectStorageClient,
  readObjectStorageConfig,
  withStoragePrefix,
} from "../../backend/src/storage/object-storage-client.mjs";

const png = Buffer.from("89504e470d0a1a0a", "hex");

test("object storage client uploads buffered objects with prefixed keys and concrete ContentLength", async () => {
  const sends = [];
  class FakePutObjectCommand {
    constructor(input) {
      this.input = input;
    }
  }

  const storage = createObjectStorageClient({
    env: storageEnv(),
    PutObjectCommand: FakePutObjectCommand,
    s3Client: {
      async send(command) {
        sends.push(command.input);
      },
    },
  });

  const result = await storage.putObject({
    key: "images/test pixel.png",
    body: png,
    contentType: "image/png",
    contentLength: png.byteLength,
    cacheControl: "public, max-age=31536000",
    metadata: { source: "test" },
  });

  assert.equal(result.key, "app-uploads/images/test pixel.png");
  assert.equal(result.url, "https://cdn.example.com/app-uploads/images/test%20pixel.png");
  assert.deepEqual(sends, [
    {
      Bucket: "media-bucket",
      Key: "app-uploads/images/test pixel.png",
      Body: png,
      ContentType: "image/png",
      ContentLength: png.byteLength,
      CacheControl: "public, max-age=31536000",
      Metadata: { source: "test" },
    },
  ]);
});

test("object storage client validates upload bodies before sending to S3", async () => {
  const storage = createObjectStorageClient({
    env: storageEnv(),
    PutObjectCommand: class {},
    s3Client: {
      async send() {
        throw new Error("send should not be called");
      },
    },
  });

  await assert.rejects(
    storage.putObject({
      key: "images/test.png",
      body: "not buffered",
      contentType: "image/png",
      contentLength: 12,
    }),
    /Object body must be buffered/,
  );

  await assert.rejects(
    storage.putObject({
      key: "images/test.png",
      body: png,
      contentType: "image/png",
      contentLength: undefined,
    }),
    /Object ContentLength must match/,
  );
});

test("object storage client signs GET URLs with prefixed keys and bounded expiration", async () => {
  const calls = [];
  class FakeGetObjectCommand {
    constructor(input) {
      this.input = input;
    }
  }

  const storage = createObjectStorageClient({
    env: storageEnv(),
    GetObjectCommand: FakeGetObjectCommand,
    getSignedUrl(client, command, options) {
      calls.push({ client, command: command.input, options });
      return "https://signed.example.com/app-uploads/images/test.png";
    },
    s3Client: { id: "fake-client" },
  });

  const signedUrl = await storage.getSignedObjectUrl({
    key: "images/test.png",
    expiresInSeconds: 300,
  });

  assert.equal(signedUrl, "https://signed.example.com/app-uploads/images/test.png");
  assert.deepEqual(calls, [
    {
      client: { id: "fake-client" },
      command: {
        Bucket: "media-bucket",
        Key: "app-uploads/images/test.png",
      },
      options: { expiresIn: 300 },
    },
  ]);

  await assert.rejects(
    storage.getSignedObjectUrl({ key: "images/test.png", expiresInSeconds: 0 }),
    /Signed URL expiration/,
  );
});

test("object storage client creates a configured S3Client with checksum behavior when not injected", async () => {
  const created = [];
  class FakeS3Client {
    constructor(config) {
      created.push(config);
    }
  }

  const storage = createObjectStorageClient({
    env: storageEnv(),
    S3Client: FakeS3Client,
    PutObjectCommand: class {
      constructor(input) {
        this.input = input;
      }
    },
  });

  await assert.rejects(
    storage.putObject({
      key: "images/test.png",
      body: png,
      contentType: "image/png",
      contentLength: png.byteLength,
    }),
    /client.send is not a function/,
  );

  assert.equal(created.length, 1);
  assert.equal(created[0].endpoint, "https://s3.example.com");
  assert.equal(created[0].region, "auto");
  assert.equal(created[0].forcePathStyle, true);
  assert.equal(created[0].requestChecksumCalculation, "WHEN_REQUIRED");
  assert.deepEqual(created[0].credentials, {
    accessKeyId: "access-key",
    secretAccessKey: "secret-key",
  });
});

test("object storage config and key helpers sanitize environment-backed paths", () => {
  const config = readObjectStorageConfig(storageEnv());
  assert.equal(config.prefix, "app-uploads");
  assert.equal(withStoragePrefix("app-uploads", "/images/test.png"), "app-uploads/images/test.png");
  assert.equal(withStoragePrefix("app-uploads", "app-uploads/images/test.png"), "app-uploads/images/test.png");
  assert.throws(() => withStoragePrefix("app-uploads", "../escape.png"), /Invalid object key/);
  assert.throws(() => readObjectStorageConfig({ ...storageEnv(), OBJECT_STORAGE_PREFIX: "../bad" }), /OBJECT_STORAGE_PREFIX is invalid/);
  assert.throws(() => readObjectStorageConfig({ ...storageEnv(), OBJECT_STORAGE_BUCKET: "" }), /OBJECT_STORAGE_BUCKET is required/);
});

test("object storage config errors use the shared ApiError contract", () => {
  assert.throws(
    () => readObjectStorageConfig({ ...storageEnv(), OBJECT_STORAGE_ENDPOINT: "ftp://example.com" }),
    (error) =>
      error instanceof ApiError &&
      error.status === 500 &&
      error.code === "CONFIGURATION_ERROR" &&
      error.message === "OBJECT_STORAGE_ENDPOINT must use http or https",
  );
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
