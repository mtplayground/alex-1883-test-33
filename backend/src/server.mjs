import { createExpressApp } from "./app.mjs";

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {Console} logger
 */
export function startServer(env = process.env, logger = console) {
  const host = env.HOST || "0.0.0.0";
  const port = parsePort(env.PORT || "8080");
  const app = createExpressApp({ logger });

  const server = app.listen(port, host, () => {
    logger.log(`alex-1883-test-33 backend listening on http://${host}:${port}`);
  });

  return server;
}

/**
 * @param {string} value
 */
function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return port;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    startServer();
  } catch (error) {
    console.error("Failed to start backend server", {
      name: error instanceof Error ? error.name : "NonErrorThrown",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exitCode = 1;
  }
}
