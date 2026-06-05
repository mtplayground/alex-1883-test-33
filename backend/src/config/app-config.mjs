import { ApiError } from "../../../scripts/error-response.mjs";

export const APP_CONFIG_SCHEMA = [
  {
    name: "NODE_ENV",
    group: "runtime",
    required: false,
    defaultValue: "production",
    validate: oneOf(["development", "test", "production"]),
  },
  {
    name: "HOST",
    group: "runtime",
    required: false,
    defaultValue: "0.0.0.0",
    validate: nonEmpty,
  },
  {
    name: "PORT",
    group: "runtime",
    required: false,
    defaultValue: "8080",
    validate: portNumber,
  },
  {
    name: "PUBLIC_APP_URL",
    group: "runtime",
    required: true,
    validate: absoluteUrl(["http:", "https:"]),
  },
  {
    name: "DATABASE_URL",
    group: "database",
    required: true,
    validate: absoluteUrl(["postgres:", "postgresql:"]),
  },
  {
    name: "GOOGLE_CLIENT_ID",
    group: "googleOAuth",
    required: true,
    validate: nonEmpty,
  },
  {
    name: "GOOGLE_CLIENT_SECRET",
    group: "googleOAuth",
    required: true,
    validate: nonEmpty,
  },
  {
    name: "GOOGLE_REDIRECT_URI",
    group: "googleOAuth",
    required: true,
    validate: absoluteUrl(["http:", "https:"]),
  },
  {
    name: "GOOGLE_OAUTH_SCOPES",
    group: "googleOAuth",
    required: false,
    defaultValue: "openid email profile",
    validate: requiredScopes(["openid", "email", "profile"]),
  },
  {
    name: "JWT_SECRET",
    group: "jwt",
    required: true,
    validate(value) {
      if (value.length < 32) {
        return "must be at least 32 characters";
      }
      return null;
    },
  },
  {
    name: "JWT_ISSUER",
    group: "jwt",
    required: false,
    defaultValue: "alex-1883-test-33",
    validate: nonEmpty,
  },
  {
    name: "JWT_AUDIENCE",
    group: "jwt",
    required: false,
    defaultValue: "alex-1883-test-33:web",
    validate: nonEmpty,
  },
  {
    name: "JWT_EXPIRES_IN_SECONDS",
    group: "jwt",
    required: false,
    defaultValue: "604800",
    validate: positiveInteger,
  },
  {
    name: "OBJECT_STORAGE_ENDPOINT",
    group: "objectStorage",
    required: true,
    validate: absoluteUrl(["http:", "https:"]),
  },
  {
    name: "OBJECT_STORAGE_REGION",
    group: "objectStorage",
    required: true,
    validate: nonEmpty,
  },
  {
    name: "OBJECT_STORAGE_BUCKET",
    group: "objectStorage",
    required: true,
    validate(value) {
      if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value)) {
        return "must be a valid S3 bucket name";
      }
      return null;
    },
  },
  {
    name: "OBJECT_STORAGE_ACCESS_KEY_ID",
    group: "objectStorage",
    required: true,
    validate: nonEmpty,
  },
  {
    name: "OBJECT_STORAGE_SECRET_ACCESS_KEY",
    group: "objectStorage",
    required: true,
    validate: nonEmpty,
  },
  {
    name: "OBJECT_STORAGE_PREFIX",
    group: "objectStorage",
    required: true,
    validate: storagePrefix,
  },
  {
    name: "OBJECT_STORAGE_PUBLIC_BASE_URL",
    group: "objectStorage",
    required: false,
    validate: optionalAbsoluteUrl(["http:", "https:"]),
  },
];

export function readAppConfig(env = process.env) {
  const result = validateAppEnv(env);
  if (!result.ok) {
    throw new ApiError(500, "CONFIGURATION_ERROR", "Environment configuration is invalid", {
      errors: result.errors,
    });
  }

  return {
    runtime: {
      nodeEnv: result.values.NODE_ENV,
      host: result.values.HOST,
      port: Number(result.values.PORT),
      publicAppUrl: result.values.PUBLIC_APP_URL,
    },
    database: {
      url: result.values.DATABASE_URL,
    },
    googleOAuth: {
      clientId: result.values.GOOGLE_CLIENT_ID,
      clientSecret: result.values.GOOGLE_CLIENT_SECRET,
      redirectUri: result.values.GOOGLE_REDIRECT_URI,
      scopes: result.values.GOOGLE_OAUTH_SCOPES.split(/\s+/).filter(Boolean),
    },
    jwt: {
      secret: result.values.JWT_SECRET,
      issuer: result.values.JWT_ISSUER,
      audience: result.values.JWT_AUDIENCE,
      expiresInSeconds: Number(result.values.JWT_EXPIRES_IN_SECONDS),
    },
    objectStorage: {
      endpoint: result.values.OBJECT_STORAGE_ENDPOINT,
      region: result.values.OBJECT_STORAGE_REGION,
      bucket: result.values.OBJECT_STORAGE_BUCKET,
      accessKeyId: result.values.OBJECT_STORAGE_ACCESS_KEY_ID,
      secretAccessKey: result.values.OBJECT_STORAGE_SECRET_ACCESS_KEY,
      prefix: result.values.OBJECT_STORAGE_PREFIX,
      publicBaseUrl: result.values.OBJECT_STORAGE_PUBLIC_BASE_URL || "",
    },
  };
}

export function validateAppEnv(env = process.env, schema = APP_CONFIG_SCHEMA) {
  const errors = [];
  const values = {};

  for (const entry of schema) {
    const rawValue = env[entry.name] ?? entry.defaultValue;
    if (rawValue === undefined || rawValue === "") {
      if (entry.required) {
        errors.push({ name: entry.name, message: "is required" });
      }
      values[entry.name] = "";
      continue;
    }

    const value = String(rawValue).trim();
    const validationError = entry.validate(value);
    if (validationError) {
      errors.push({ name: entry.name, message: validationError });
    }
    values[entry.name] = value;
  }

  return {
    ok: errors.length === 0,
    errors,
    values,
  };
}

function nonEmpty(value) {
  if (!value.trim()) {
    return "must not be empty";
  }
  return null;
}

function oneOf(values) {
  return (value) => {
    if (!values.includes(value)) {
      return `must be one of: ${values.join(", ")}`;
    }
    return null;
  };
}

function absoluteUrl(protocols) {
  return (value) => {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      return "must be an absolute URL";
    }

    if (!protocols.includes(parsed.protocol)) {
      return `must use one of these protocols: ${protocols.join(", ")}`;
    }
    return null;
  };
}

function optionalAbsoluteUrl(protocols) {
  const validateUrl = absoluteUrl(protocols);
  return (value) => {
    if (!value) {
      return null;
    }
    return validateUrl(value);
  };
}

function portNumber(value) {
  if (!/^\d+$/.test(value)) {
    return "must be an integer";
  }
  const parsed = Number(value);
  if (parsed < 1 || parsed > 65535) {
    return "must be between 1 and 65535";
  }
  return null;
}

function positiveInteger(value) {
  if (!/^\d+$/.test(value) || Number(value) <= 0) {
    return "must be a positive integer";
  }
  return null;
}

function requiredScopes(requiredValues) {
  return (value) => {
    const scopes = new Set(value.split(/\s+/).filter(Boolean));
    for (const required of requiredValues) {
      if (!scopes.has(required)) {
        return `must include ${requiredValues.join(", ")}`;
      }
    }
    return null;
  };
}

function storagePrefix(value) {
  if (!value.trim()) {
    return "must not be empty";
  }
  if (value.startsWith("/") || value.endsWith("/")) {
    return "must not start or end with a slash";
  }
  if (value.includes("..")) {
    return "must not contain path traversal segments";
  }
  return null;
}
