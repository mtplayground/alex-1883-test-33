import crypto from "node:crypto";
import path from "node:path";
import { ApiError } from "../../../scripts/error-response.mjs";
import {
  createObjectStorageClient,
  readObjectStorageConfig,
  withStoragePrefix,
} from "../storage/object-storage-client.mjs";

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
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  getSignedUrl,
} = {}) {
  const objectStorage = createObjectStorageClient({
    env,
    s3Client,
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    getSignedUrl,
  });

  return {
    async putImage({ key, body, contentType, contentLength }) {
      if (!Buffer.isBuffer(body) && !(body instanceof Uint8Array)) {
        throw new ApiError(400, "VALIDATION_ERROR", "Image body must be buffered before upload");
      }
      if (!Number.isInteger(contentLength) || contentLength !== body.byteLength) {
        throw new ApiError(400, "VALIDATION_ERROR", "Image ContentLength must match the buffered body length");
      }

      return objectStorage.putObject({ key, body, contentType, contentLength });
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

export { readObjectStorageConfig, withStoragePrefix };

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
