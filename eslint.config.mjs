import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const projectFiles = ["backend/**/*.mjs", "frontend/**/*.mjs", "scripts/**/*.mjs", "tests/**/*.mjs"];
const typeScriptFiles = ["backend/**/*.ts", "frontend/**/*.ts", "scripts/**/*.ts", "tests/**/*.ts"];

export default [
  {
    ignores: [
      "backend/src/generated/**",
      "coverage/**",
      "node_modules/**",
      "target/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: projectFiles,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "no-console": "off",
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: typeScriptFiles,
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
  },
  {
    files: ["tests/**/*.mjs", "tests/**/*.ts"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
];
