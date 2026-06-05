import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const tsconfig = JSON.parse(fs.readFileSync("tsconfig.json", "utf8"));
const prettierConfig = JSON.parse(fs.readFileSync(".prettierrc.json", "utf8"));
const eslintConfig = fs.readFileSync("eslint.config.mjs", "utf8");
const prettierIgnore = fs.readFileSync(".prettierignore", "utf8");

test("package scripts expose unified typecheck, lint, and formatting commands", () => {
  assert.equal(packageJson.scripts.typecheck, "tsc --project tsconfig.json --noEmit");
  assert.equal(packageJson.scripts.lint, "eslint .");
  assert.equal(packageJson.scripts["format:check"], "prettier --check .");
  assert.equal(packageJson.scripts.format, "prettier --write .");
  assert.equal(packageJson.scripts.check, "npm run build && npm run typecheck && npm run lint && npm run format:check");
});

test("tooling dependencies include TypeScript, ESLint flat config, and Prettier", () => {
  for (const dependency of [
    "typescript",
    "eslint",
    "@eslint/js",
    "typescript-eslint",
    "prettier",
    "globals",
    "@types/node",
  ]) {
    assert.ok(packageJson.devDependencies[dependency], `${dependency} must be declared`);
  }
});

test("TypeScript config type-checks JavaScript across backend, frontend, scripts, and tests", () => {
  assert.equal(tsconfig.compilerOptions.allowJs, true);
  assert.equal(tsconfig.compilerOptions.checkJs, true);
  assert.equal(tsconfig.compilerOptions.noEmit, true);
  assert.equal(tsconfig.compilerOptions.strict, true);
  assert.deepEqual(tsconfig.compilerOptions.module, "NodeNext");
  assert.deepEqual(tsconfig.include, ["backend/**/*.mjs", "frontend/**/*.mjs", "scripts/**/*.mjs", "tests/**/*.mjs"]);
  assert.ok(tsconfig.exclude.includes("backend/src/generated"));
  assert.ok(tsconfig.exclude.includes("node_modules"));
});

test("ESLint config covers JS and TS sources without linting generated output", () => {
  assert.match(eslintConfig, /@eslint\/js/);
  assert.match(eslintConfig, /typescript-eslint/);
  assert.match(eslintConfig, /backend\/\*\*\/\*\.mjs/);
  assert.match(eslintConfig, /frontend\/\*\*\/\*\.mjs/);
  assert.match(eslintConfig, /scripts\/\*\*\/\*\.mjs/);
  assert.match(eslintConfig, /tests\/\*\*\/\*\.mjs/);
  assert.match(eslintConfig, /backend\/src\/generated\/\*\*/);
});

test("Prettier config and ignore file define shared formatting behavior", () => {
  assert.equal(prettierConfig.printWidth, 120);
  assert.equal(prettierConfig.trailingComma, "all");
  assert.equal(prettierConfig.singleQuote, false);
  assert.match(prettierIgnore, /backend\/src\/generated\//);
  assert.match(prettierIgnore, /node_modules\//);
});
