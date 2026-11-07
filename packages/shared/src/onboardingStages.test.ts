import { describe, expect, it } from "vitest";

import { ONBOARDING_DOT_COUNT, ONBOARDING_READING_ROUTE, onboardingProgress } from "./onboardingStages";

describe("onboardingProgress", () => {
  it("counts sign-up and seven later steps on a direct path", () => {
    expect(ONBOARDING_DOT_COUNT).toBe(8);
    expect(onboardingProgress("/onboarding/website", null)).toEqual({ current: 3, total: 8 });
    expect(onboardingProgress("/onboarding/meet", null)).toEqual({ current: 8, total: 8 });
    expect(onboardingProgress("/onboarding/number", null)).toEqual({ current: 5, total: 8 });
  });

  it("keeps the language question and the wait on the website's dot", () => {
    expect(onboardingProgress("/onboarding/language", null)).toEqual({ current: 3, total: 8 });
    expect(onboardingProgress(ONBOARDING_READING_ROUTE, null)).toEqual({ current: 3, total: 8 });
  });

  it("counts a partner's steps, and shows none for an activity-level owner", () => {
    expect(onboardingProgress("/onboarding/meet", "full")).toEqual({ current: 3, total: 3 });
    expect(onboardingProgress("/onboarding/verify-phone", "activity")).toBeNull();
  });

});
