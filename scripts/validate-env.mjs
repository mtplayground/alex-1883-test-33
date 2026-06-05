#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { APP_CONFIG_SCHEMA } from "../backend/src/config/app-config.mjs";

const schema = APP_CONFIG_SCHEMA;

const options = parseArgs(process.argv.slice(2));

if (options.schemaOnly) {
  validateSchema(schema);
  console.log("environment schema is valid");
  process.exit(0);
}

const env = options.envFile ? loadEnvFile(options.envFile) : process.env;
const result = validateEnv(env, schema);

if (!result.ok) {
  for (const error of result.errors) {
    console.error(`ENV_ERROR ${error.name}: ${error.message}`);
  }
  process.exit(1);
}

console.log("environment is valid");

function parseArgs(args) {
  const parsed = {
    envFile: null,
    schemaOnly: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--schema-only") {
      parsed.schemaOnly = true;
    } else if (arg === "--env-file") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--env-file requires a path");
      }
      parsed.envFile = value;
      index += 1;
    } else if (arg.startsWith("--env-file=")) {
      parsed.envFile = arg.slice("--env-file=".length);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return parsed;
}

export function validateEnv(env, entries = schema) {
  const errors = [];

  for (const entry of entries) {
    const rawValue = env[entry.name] ?? entry.defaultValue;
    if (rawValue === undefined || rawValue === "") {
      if (entry.required) {
        errors.push({ name: entry.name, message: "is required" });
      }
      continue;
    }

    const value = String(rawValue);
    const validationError = entry.validate(value);
    if (validationError) {
      errors.push({ name: entry.name, message: validationError });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

function validateSchema(entries) {
  const names = new Set();

  for (const entry of entries) {
    if (!entry.name || names.has(entry.name)) {
      throw new Error(`duplicate or missing environment variable name: ${entry.name}`);
    }
    if (typeof entry.validate !== "function") {
      throw new Error(`${entry.name} is missing a validator`);
    }
    names.add(entry.name);
  }
}

function loadEnvFile(filePath) {
  const absolutePath = path.resolve(filePath);
  const content = fs.readFileSync(absolutePath, "utf8");
  const env = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      throw new Error(`invalid env line in ${absolutePath}: ${line}`);
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    env[key] = unquote(rawValue);
  }

  return env;
}

function unquote(value) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
