import { describe, expect, it } from "vitest";

import { ONBOARDING_DOT_COUNT, ONBOARDING_READING_ROUTE, onboardingBackRoute, onboardingProgress } from "./onboardingStages";

describe("onboardingProgress", () => {
  it("counts sign-up and seven later steps on a direct path", () => {
    expect(ONBOARDING_DOT_COUNT).toBe(8);
    expect(onboardingProgress("/onboarding/website", "website", null)).toMatchObject({ current: 3, navigableUntil: 3, total: 8 });
    expect(onboardingProgress("/onboarding/meet", "meet", null)).toMatchObject({ current: 8, navigableUntil: 8, total: 8 });
    expect(onboardingProgress("/onboarding/number", "complete", null)).toMatchObject({ current: 5, navigableUntil: 8, total: 8 });
  });

  it("keeps the language question and the wait on the website's dot", () => {
    expect(onboardingProgress("/onboarding/language", "language", null)).toMatchObject({ current: 3, navigableUntil: 3, total: 8 });
    expect(onboardingProgress(ONBOARDING_READING_ROUTE, "verify_phone", null)).toMatchObject({ current: 3, navigableUntil: 4, total: 8 });
  });

  it("counts a partner's steps, and shows none for an activity-level owner", () => {
    expect(onboardingProgress("/onboarding/meet", "meet", "full")).toMatchObject({ current: 3, navigableUntil: 3, total: 3, routes: ["/onboarding/website", "/onboarding/verify-phone", "/onboarding/meet"] });
    expect(onboardingProgress("/onboarding/verify-phone", "verify_phone", "activity")).toBeNull();
  });

  it("reads a retired stage as the step that replaced it", () => {
    expect(onboardingProgress("/onboarding/website", "test_call", null)).toMatchObject({ current: 3, navigableUntil: 4 });
  });
});

describe("onboardingBackRoute", () => {
  const direct = { stage: "meet", partnerAccessLevel: null, websiteUrl: "https://example.com" };

  it("walks a website path backwards, past the language question", () => {
    expect(onboardingBackRoute("/onboarding/meet", direct)).toBe("/onboarding/attribution");
    expect(onboardingBackRoute("/onboarding/attribution", direct)).toBe("/onboarding/goal");
    expect(onboardingBackRoute("/onboarding/goal", direct)).toBe("/onboarding/number");
    expect(onboardingBackRoute("/onboarding/number", direct)).toBe("/onboarding/verify-phone");
    expect(onboardingBackRoute("/onboarding/verify-phone", direct)).toBe("/onboarding/website");
    expect(onboardingBackRoute(ONBOARDING_READING_ROUTE, direct)).toBe("/onboarding/website");
    expect(onboardingBackRoute("/onboarding/website", direct)).toBe("/onboarding/business");
  });

  it("goes back through the language question without a website", () => {
    const noWebsite = { ...direct, websiteUrl: null };
    expect(onboardingBackRoute("/onboarding/verify-phone", noWebsite)).toBe("/onboarding/language");
    expect(onboardingBackRoute("/onboarding/language", noWebsite)).toBe("/onboarding/website");
  });

  it("has no Back on an owner's first step", () => {
    expect(onboardingBackRoute("/onboarding/business", direct)).toBeNull();
    expect(onboardingBackRoute("/onboarding/website", { ...direct, partnerAccessLevel: "full" })).toBeNull();
    expect(onboardingBackRoute("/onboarding/verify-phone", { ...direct, partnerAccessLevel: "activity" })).toBeNull();
  });

  it("skips the steps a partner's business doesn't have", () => {
    expect(onboardingBackRoute("/onboarding/meet", { ...direct, partnerAccessLevel: "full" })).toBe("/onboarding/verify-phone");
  });

  it("goes around the phone step when a self-hosted install skips it", () => {
    expect(onboardingBackRoute("/onboarding/number", { ...direct, verifiesPhone: false })).toBe("/onboarding/website");
  });

  it("has no Back once onboarding is over", () => {
    expect(onboardingBackRoute("/onboarding/number", { ...direct, stage: "complete" })).toBeNull();
  });
});
