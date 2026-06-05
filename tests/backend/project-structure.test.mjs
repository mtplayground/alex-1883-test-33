import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const rootPackage = JSON.parse(fs.readFileSync("package.json", "utf8"));
const backendPackage = JSON.parse(fs.readFileSync("backend/package.json", "utf8"));
const frontendPackage = JSON.parse(fs.readFileSync("frontend/package.json", "utf8"));
const backendApp = fs.readFileSync("backend/src/app.mjs", "utf8");
const backendServer = fs.readFileSync("backend/src/server.mjs", "utf8");
const frontendIndex = fs.readFileSync("frontend/index.html", "utf8");
const frontendApp = fs.readFileSync("frontend/src/App.mjs", "utf8");
const frontendMain = fs.readFileSync("frontend/src/main.mjs", "utf8");

test("root package exposes frontend and backend workspaces with start scripts", () => {
  assert.deepEqual(rootPackage.workspaces, ["backend", "frontend"]);
  assert.equal(rootPackage.scripts.start, "npm --workspace backend run start");
  assert.equal(rootPackage.scripts.dev, "npm run dev:backend");
  assert.equal(rootPackage.scripts["dev:backend"], "npm --workspace backend run dev");
  assert.equal(rootPackage.scripts["dev:frontend"], "npm --workspace frontend run dev");
  assert.equal(rootPackage.scripts["build:backend"], "npm --workspace backend run build");
  assert.equal(rootPackage.scripts["build:frontend"], "npm --workspace frontend run build");
});

test("backend package is an Express service with production and dev entrypoints", () => {
  assert.equal(backendPackage.name, "alex-1883-test-33-backend");
  assert.equal(backendPackage.type, "module");
  assert.equal(backendPackage.scripts.start, "node src/server.mjs");
  assert.equal(backendPackage.scripts.dev, "node --watch src/server.mjs");
  assert.ok(backendPackage.dependencies.express);
  assert.ok(backendPackage.devDependencies["@types/express"]);
});

test("backend Express app exposes health routes and logged error handling", () => {
  assert.match(backendApp, /import express from "express"/);
  assert.match(backendApp, /app\.get\("\/healthz"/);
  assert.match(backendApp, /app\.get\("\/api\/healthz"/);
  assert.match(backendApp, /function errorHandler\(logger\)/);
  assert.match(backendApp, /logUnhandledError\(error, requestId, logger\)/);
  assert.match(backendApp, /toErrorResponse\(error, requestId\)/);
});

test("backend server listens on 0.0.0.0:8080 by default", () => {
  assert.match(backendServer, /env\.HOST \|\| "0\.0\.0\.0"/);
  assert.match(backendServer, /env\.PORT \|\| "8080"/);
  assert.match(backendServer, /app\.listen\(port, host/);
});

test("frontend package is a React Vite app with dev and build scripts", () => {
  assert.equal(frontendPackage.name, "alex-1883-test-33-frontend");
  assert.equal(frontendPackage.type, "module");
  assert.equal(frontendPackage.scripts.dev, "vite --host 0.0.0.0 --port 5173");
  assert.equal(frontendPackage.scripts.build, "vite build");
  assert.ok(frontendPackage.dependencies.react);
  assert.ok(frontendPackage.dependencies["react-dom"]);
  assert.ok(frontendPackage.dependencies.vite);
  assert.ok(frontendPackage.dependencies["@vitejs/plugin-react"]);
});

test("frontend has a Vite HTML entry and React root module", () => {
  assert.match(frontendIndex, /<div id="root"><\/div>/);
  assert.match(frontendIndex, /src="\/src\/main\.mjs"/);
  assert.match(frontendApp, /export function App\(\)/);
  assert.match(frontendMain, /createRoot/);
  assert.match(frontendMain, /React\.StrictMode/);
});
