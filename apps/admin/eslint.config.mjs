import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import next from "@next/eslint-plugin-next"
import jsxA11y from "eslint-plugin-jsx-a11y"
import tseslint from "typescript-eslint"
import { defineConfig, globalIgnores } from "eslint/config"

/**
 * Static analysis for the admin app. Type checking stays in `pnpm typecheck`;
 * this config covers the runtime hazards TypeScript cannot see.
 */
export default defineConfig([
  globalIgnores([".next/**", "node_modules/**", "test-results/**", "playwright-report/**", "next-env.d.ts"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "react-hooks": reactHooks, "@next/next": next, "jsx-a11y": jsxA11y },
    settings: { next: { rootDir: import.meta.dirname } },
    rules: {
      ...next.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      // Existing step forms intentionally focus their primary control.
      "jsx-a11y/no-autofocus": "warn",
      // Adopt compiler migration rules separately from the core Hooks checks.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Server actions and route handlers legitimately accept untyped payloads.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // This primitive forwards htmlFor and children from its call sites.
    files: ["src/components/ui/label.tsx"],
    rules: { "jsx-a11y/label-has-associated-control": "off" },
  },
  {
    // These elements play live WebRTC streams, not captionable media files.
    files: ["src/components/web-voice/AuraVoiceDemo.tsx", "src/components/widget/widget-chat-client.tsx"],
    rules: { "jsx-a11y/media-has-caption": "off" },
  },
  {
    // Test files assert on partial fixtures and mocked modules.
    files: ["**/*.test.{ts,tsx}", "**/*.test-d.{ts,tsx}"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
])
