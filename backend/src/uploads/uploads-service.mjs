import crypto from "node:crypto";
import path from "node:path";
import { ApiError } from "../../../scripts/error-response.mjs";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const EXTENSIONS_BY_TYPE = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
]);

export function createUploadsService({ storage, keyFactory = createImageObjectKey } = {}) {
  if (!storage || typeof storage.putImage !== "function") {
    throw new Error("storage.putImage is required");
  }

  async function uploadImage(input) {
    const file = await normalizeImageInput(input);
    const key = keyFactory(file);
    const stored = await storage.putImage({
      key,
      body: file.buffer,
      contentType: file.contentType,
      contentLength: file.buffer.byteLength,
    });

    return {
      imageUrl: stored.url,
      url: stored.url,
      key: stored.key,
      contentType: file.contentType,
      size: file.buffer.byteLength,
    };
  }

  return { uploadImage };
}

export function createS3ImageStorage({
  env = process.env,
  s3Client,
  PutObjectCommand,
  now = () => new Date(),
} = {}) {
  const config = readObjectStorageConfig(env);

  async function getClientParts() {
    if (s3Client && PutObjectCommand) {
      return { client: s3Client, PutObjectCommand };
    }

    const aws = await import("@aws-sdk/client-s3");
    return {
      client:
        s3Client ??
        new aws.S3Client({
          endpoint: config.endpoint,
          region: config.region,
          forcePathStyle: true,
          credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          },
          requestChecksumCalculation: "WHEN_REQUIRED",
        }),
      PutObjectCommand: PutObjectCommand ?? aws.PutObjectCommand,
    };
  }

  return {
    async putImage({ key, body, contentType, contentLength }) {
      if (!Buffer.isBuffer(body)) {
        throw new ApiError(400, "VALIDATION_ERROR", "Image body must be buffered before upload");
      }
      if (!Number.isInteger(contentLength) || contentLength !== body.byteLength) {
        throw new ApiError(400, "VALIDATION_ERROR", "Image ContentLength must match the buffered body length");
      }

      const objectKey = withStoragePrefix(config.prefix, key);
      const { client, PutObjectCommand: Command } = await getClientParts();
      await client.send(
        new Command({
          Bucket: config.bucket,
          Key: objectKey,
          Body: body,
          ContentType: contentType,
          ContentLength: contentLength,
        }),
      );

      return {
        key: objectKey,
        url: buildObjectUrl(config, objectKey, now()),
      };
    },
  };
}

export function createImageObjectKey({ contentType, originalName } = {}) {
  const extension = extensionFor(contentType, originalName);
  const datePath = new Date().toISOString().slice(0, 10).replaceAll("-", "/");
  return `images/${datePath}/${crypto.randomUUID()}${extension}`;
}

export async function normalizeImageInput(input = {}) {
  const source = input.file ?? input.image ?? input;
  const contentType = normalizeContentType(source.contentType ?? source.type ?? input.contentType ?? input.type);
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Unsupported image type", {
      allowedTypes: [...ALLOWED_IMAGE_TYPES],
    });
  }

  const buffer = await toBuffer(source.buffer ?? source.body ?? source.data ?? source.bytes ?? source);
  if (buffer.byteLength === 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "Image file is required");
  }
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Image file is too large", {
      maxBytes: MAX_IMAGE_BYTES,
    });
  }

  return {
    buffer,
    contentType,
    originalName: String(source.originalName ?? source.name ?? input.originalName ?? input.fileName ?? ""),
  };
}

export function readObjectStorageConfig(env) {
  return {
    endpoint: requireEnvUrl(env, "OBJECT_STORAGE_ENDPOINT"),
    region: requireEnv(env, "OBJECT_STORAGE_REGION"),
    bucket: requireEnv(env, "OBJECT_STORAGE_BUCKET"),
    accessKeyId: requireEnv(env, "OBJECT_STORAGE_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv(env, "OBJECT_STORAGE_SECRET_ACCESS_KEY"),
    prefix: normalizeStoragePrefix(requireEnv(env, "OBJECT_STORAGE_PREFIX")),
    publicBaseUrl: optionalEnvUrl(env, "OBJECT_STORAGE_PUBLIC_BASE_URL"),
  };
}

export function withStoragePrefix(prefix, key) {
  const normalizedPrefix = normalizeStoragePrefix(prefix);
  const normalizedKey = String(key ?? "").replace(/^\/+/, "");
  if (!normalizedKey || normalizedKey.includes("..")) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid object key");
  }
  return `${normalizedPrefix}/${normalizedKey}`;
}

function buildObjectUrl(config, objectKey, _now) {
  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl.replace(/\/+$/, "")}/${encodeObjectKey(objectKey)}`;
  }

  const endpoint = config.endpoint.replace(/\/+$/, "");
  return `${endpoint}/${encodeURIComponent(config.bucket)}/${encodeObjectKey(objectKey)}`;
}

function encodeObjectKey(key) {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function extensionFor(contentType, originalName) {
  const mapped = EXTENSIONS_BY_TYPE.get(contentType);
  if (mapped) {
    return mapped;
  }

  const extension = path.extname(String(originalName ?? "")).toLowerCase();
  return extension && extension.length <= 8 ? extension : ".img";
}

async function toBuffer(value) {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }
  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return Buffer.from(await value.arrayBuffer());
  }
  if (typeof value === "string") {
    return Buffer.from(value);
  }
  throw new ApiError(400, "VALIDATION_ERROR", "Image file is required");
}

function normalizeContentType(value) {
  return String(value ?? "").split(";")[0].trim().toLowerCase();
}

function requireEnv(env, name) {
  const value = env[name];
  if (!value || !String(value).trim()) {
    throw new ApiError(500, "CONFIGURATION_ERROR", `${name} is required`);
  }
  return String(value).trim();
}

function requireEnvUrl(env, name) {
  const value = requireEnv(env, name);
  validateUrl(value, name);
  return value;
}

function optionalEnvUrl(env, name) {
  const value = env[name];
  if (!value || !String(value).trim()) {
    return "";
  }
  const normalized = String(value).trim();
  validateUrl(normalized, name);
  return normalized;
}

function validateUrl(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError(500, "CONFIGURATION_ERROR", `${name} must be an absolute URL`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ApiError(500, "CONFIGURATION_ERROR", `${name} must use http or https`);
  }
}

function normalizeStoragePrefix(value) {
  const prefix = String(value ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (!prefix || prefix.includes("..")) {
    throw new ApiError(500, "CONFIGURATION_ERROR", "OBJECT_STORAGE_PREFIX is invalid");
  }
  return prefix;
}
