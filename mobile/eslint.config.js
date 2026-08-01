const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const typescriptEslint = require("@typescript-eslint/eslint-plugin");

module.exports = defineConfig([
  expoConfig,
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["dist/**", "coverage/**"],
    plugins: {
      "@typescript-eslint": typescriptEslint,
    },
    rules: {
      "react-hooks/exhaustive-deps": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
]);
