import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
  { ignores: ["main.js", "dist", "node_modules", "coverage", "package.json", "package-lock.json", "manifest.json", "versions.json"] },
  ...obsidianmd.configs.recommended.filter((config) => config.language !== "json/json"),
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: { globals: { ...globals.browser, ...globals.node }, parserOptions: { project: "./tsconfig.json", tsconfigRootDir: import.meta.dirname } },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "obsidianmd/ui/sentence-case": ["warn", { "brands": ["Hexo", "Hexo Send", "Markdown", "Obsidian", "OpenAI", "SecretStorage"], "acronyms": ["AI", "API", "CLI", "Git", "HTTP", "SEO", "URL"] }]
    }
  },
  {
    files: ["**/*.mjs"],
    languageOptions: { globals: globals.node }
  }
);
