import { describe, expect, it } from "vitest";

import {
  canVisitOnboardingStage,
  getPhoneVerificationApprovedRedirect,
} from "./onboardingNavigation";

describe("onboarding navigation", () => {
  it("keeps plan-stage businesses out of number selection", () => {
    expect(canVisitOnboardingStage("plan", "phone_number")).toBe(false);
    expect(canVisitOnboardingStage("phone_number", "phone_number")).toBe(true);
    expect(canVisitOnboardingStage("completed", "phone_number")).toBe(true);
  });

  it("returns completed businesses to settings number selection after verification", () => {
    expect(getPhoneVerificationApprovedRedirect("completed")).toBe("/onboarding/number");
    expect(getPhoneVerificationApprovedRedirect("verify_phone_code")).toBe("/onboarding/plan");
  });
});
