import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    passWithNoTests: true,
    include: [
      "src/lib/auth-return-to.test.ts",
      "src/lib/locale.test.ts",
      "src/lib/phone.test.ts",
      "src/features/onboarding/onboardingNavigation.test.ts",
      "src/features/onboarding/onboardingErrors.test.ts",
      "src/components/ui/surface.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
