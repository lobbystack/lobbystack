import { describe, expect, it } from "vitest";

import {
  canVisitOnboardingStage,
  getPhoneVerificationApprovedRedirect,
  getOnboardingRouteForStage,
  onboardingStageNeedsBillingPlan,
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

  it("routes legacy free-plan number stages back through plan selection", () => {
    expect(onboardingStageNeedsBillingPlan("phone_number")).toBe(true);
    expect(onboardingStageNeedsBillingPlan("phone_number_claiming")).toBe(true);
    expect(getOnboardingRouteForStage("phone_number", "free_cloud")).toBe(
      "/onboarding/plan",
    );
    expect(getOnboardingRouteForStage("phone_number_claiming", "free_cloud")).toBe(
      "/onboarding/plan",
    );
    expect(getOnboardingRouteForStage("phone_number", "starter")).toBe(
      "/onboarding/number",
    );
    expect(getOnboardingRouteForStage("phone_number", "self_host")).toBe(
      "/onboarding/number",
    );
  });
});
