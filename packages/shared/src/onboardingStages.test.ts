import { describe, expect, it } from "vitest";

import { ONBOARDING_DOT_COUNT, ONBOARDING_READING_ROUTE, onboardingProgress } from "./onboardingStages";

describe("onboardingProgress", () => {
  it("counts sign-up and five later steps on a direct path, with no phone or goal step", () => {
    expect(ONBOARDING_DOT_COUNT).toBe(6);
    expect(onboardingProgress("/onboarding/website", null)).toEqual({ current: 3, total: 6 });
    expect(onboardingProgress("/onboarding/number", null)).toEqual({ current: 4, total: 6 });
    // The plans after Meet your agent share its dot.
    expect(onboardingProgress("/onboarding/plan", null)).toEqual({ current: 6, total: 6 });
    expect(onboardingProgress("/onboarding/attribution", null)).toEqual({ current: 5, total: 6 });
    expect(onboardingProgress("/onboarding/meet", null)).toEqual({ current: 6, total: 6 });
    expect(onboardingProgress("/onboarding/verify-phone", null)).toBeNull();
    expect(onboardingProgress("/onboarding/goal", null)).toBeNull();
  });

  it("keeps the language question and the wait on the website's dot", () => {
    expect(onboardingProgress("/onboarding/language", null)).toEqual({ current: 3, total: 6 });
    expect(onboardingProgress(ONBOARDING_READING_ROUTE, null)).toEqual({ current: 3, total: 6 });
  });

  it("counts a partner's steps, and shows none for an activity-level owner", () => {
    expect(onboardingProgress("/onboarding/meet", "full")).toEqual({ current: 3, total: 3 });
    expect(onboardingProgress("/onboarding/verify-phone", "activity")).toBeNull();
  });

});
