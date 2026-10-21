// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

// Importing either one fails, so a test below fails if the widget's code reaches it.
vi.mock("posthog-js", () => { throw new Error("The website widget loaded PostHog."); });
vi.mock("@/components/replacement-locale-provider", () => { throw new Error("The website widget loaded the saved language preference."); });

describe("the website widget's page", () => {
  // A page's download holds every client component its layout and page import.
  it("leaves PostHog and the saved language preference out of the widget's download", async () => {
    await expect(import("./layout")).resolves.toHaveProperty("default");
    await expect(import("./embed/[key]/page")).resolves.toHaveProperty("default");
    // The app's error pages are in every page's download.
    await expect(import("../error")).resolves.toHaveProperty("default");
    await expect(import("../global-error")).resolves.toHaveProperty("default");
  });

  it("would notice the providers every other page uses", async () => {
    await expect(import("@/app/providers")).rejects.toThrow();
  });
});
