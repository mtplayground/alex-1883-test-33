import { ApiError } from "../../../scripts/error-response.mjs";

export function createObjectStorageClient({
  env = process.env,
  config = readObjectStorageConfig(env),
  s3Client,
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  getSignedUrl,
} = {}) {
  let cachedClient = s3Client;
  let cachedS3Module = null;
  let cachedSignerModule = null;

  async function getS3Export(name, injected) {
    if (injected) {
      return injected;
    }

    if (!cachedS3Module) {
      cachedS3Module = await import("@aws-sdk/client-s3");
    }
    return cachedS3Module[name];
  }

  async function getSigner() {
    if (getSignedUrl) {
      return getSignedUrl;
    }

    try {
      cachedSignerModule ??= await import("@aws-sdk/s3-request-presigner");
    } catch {
      cachedSignerModule = {};
    }
    return cachedSignerModule.getSignedUrl;
  }

  async function getClient() {
    if (cachedClient) {
      return cachedClient;
    }

    const Client = await getS3Export("S3Client", S3Client);
    cachedClient = new Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
    });
    return cachedClient;
  }

  async function putObject({ key, body, contentType, contentLength, cacheControl, metadata } = {}) {
    validateBufferedBody(body);
    validateContentLength(contentLength, body.byteLength);

    const objectKey = withStoragePrefix(config.prefix, key);
    const client = await getClient();
    const Command = await getS3Export("PutObjectCommand", PutObjectCommand);

    await client.send(
      new Command({
        Bucket: config.bucket,
        Key: objectKey,
        Body: body,
        ContentType: contentType,
        ContentLength: contentLength,
        ...(cacheControl ? { CacheControl: cacheControl } : {}),
        ...(metadata ? { Metadata: metadata } : {}),
      }),
    );

    return {
      key: objectKey,
      url: getPublicObjectUrl(objectKey),
    };
  }

  async function getSignedObjectUrl({ key, expiresInSeconds = 900 } = {}) {
    validateExpiresIn(expiresInSeconds);

    const objectKey = withStoragePrefix(config.prefix, key);
    const client = await getClient();
    const Command = await getS3Export("GetObjectCommand", GetObjectCommand);
    const signUrl = await getSigner();
    if (typeof signUrl !== "function") {
      throw new ApiError(500, "CONFIGURATION_ERROR", "@aws-sdk/s3-request-presigner is required");
    }

    return signUrl(
      client,
      new Command({
        Bucket: config.bucket,
        Key: objectKey,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  function getPublicObjectUrl(key) {
    const objectKey = withStoragePrefix(config.prefix, key);
    if (config.publicBaseUrl) {
      return `${config.publicBaseUrl.replace(/\/+$/, "")}/${encodeObjectKey(objectKey)}`;
    }

    const endpoint = config.endpoint.replace(/\/+$/, "");
    return `${endpoint}/${encodeURIComponent(config.bucket)}/${encodeObjectKey(objectKey)}`;
  }

  return {
    putObject,
    getSignedObjectUrl,
    getPublicObjectUrl,
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
  if (normalizedKey === normalizedPrefix || normalizedKey.startsWith(`${normalizedPrefix}/`)) {
    return normalizedKey;
  }
  return `${normalizedPrefix}/${normalizedKey}`;
}

function validateBufferedBody(body) {
  if (!Buffer.isBuffer(body) && !(body instanceof Uint8Array)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Object body must be buffered before upload");
  }
}

function validateContentLength(contentLength, byteLength) {
  if (!Number.isInteger(contentLength) || contentLength !== byteLength) {
    throw new ApiError(400, "VALIDATION_ERROR", "Object ContentLength must match the buffered body length");
  }
}

function validateExpiresIn(expiresInSeconds) {
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 604800) {
    throw new ApiError(400, "VALIDATION_ERROR", "Signed URL expiration must be between 1 and 604800 seconds");
  }
}

function encodeObjectKey(key) {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
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
