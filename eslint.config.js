import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
    },
  },
  {
    files: ["src/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [{
            regex: "(?:^|/)(?:engine|extensions|cli)/",
            message: "core must not depend on engine, extensions, or cli",
          }],
        },
      ],
    },
  },
  {
    files: ["src/engine/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [{
            regex: "(?:^|/)(?:extensions|cli)/|(?:^|/)core/(?!index\\.js$)",
            message: "engine may depend only on its own files and the core public entry",
          }],
        },
      ],
    },
  },
  {
    files: ["src/extensions/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [{
            regex: "(?:^|/)(?:engine|cli)/|(?:^|/)core/(?!index\\.js$)",
            message: "extensions may depend only on their own files and the core public entry",
          }],
        },
      ],
    },
  },
  {
    files: ["src/cli/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [{
            regex: "(?:^|/)(?:core|engine|extensions)/(?!index\\.js$)",
            message: "cli must consume other layers through their public entries",
          }],
        },
      ],
    },
  },
);
