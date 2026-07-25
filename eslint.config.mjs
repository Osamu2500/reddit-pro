import globals from "globals";

export default [
  {
    ignores: ["node_modules/", "dist/"]
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        chrome: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "no-undef": "error",
      "prefer-const": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }]
    }
  }
];
