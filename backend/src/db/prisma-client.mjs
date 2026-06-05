import { ApiError } from "../../../scripts/error-response.mjs";

export async function createPrismaClient({ env = process.env, PrismaClient } = {}) {
  const databaseUrl = readPrismaDatabaseUrl(env);
  const Client = PrismaClient ?? (await import("../generated/prisma/client.js")).PrismaClient;

  return new Client({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
}

export function readPrismaDatabaseUrl(env = process.env) {
  const value = env.DATABASE_URL;
  if (!value || !String(value).trim()) {
    throw new ApiError(500, "CONFIGURATION_ERROR", "DATABASE_URL is required");
  }

  const databaseUrl = String(value).trim();
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new ApiError(500, "CONFIGURATION_ERROR", "DATABASE_URL must be an absolute URL");
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new ApiError(500, "CONFIGURATION_ERROR", "DATABASE_URL must use PostgreSQL");
  }

  return databaseUrl;
}
