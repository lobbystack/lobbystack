import { describe, expect, it } from "vitest";

import { isOnboardingStage, isValidOnboardingTransition, resolveOnboardingRoute } from "./onboarding";

describe("onboarding stages", () => {
  it("maps persisted stages to their dedicated routes", () => {
    expect(resolveOnboardingRoute("verify_phone_code")).toBe("/onboarding/verify-phone/code");
    expect(resolveOnboardingRoute("phone_number_claiming")).toBe("/onboarding/number");
    expect(resolveOnboardingRoute("complete")).toBe("/");
  });

  it("allows only adjacent transitions, with an explicit number-selection skip", () => {
    expect(isValidOnboardingTransition("website", "knowledge")).toBe(true);
    expect(isValidOnboardingTransition("plan", "attribution")).toBe(true);
    expect(isValidOnboardingTransition("website", "plan")).toBe(false);
    expect(isValidOnboardingTransition("complete", "website")).toBe(false);
  });

  it("rejects unknown persisted values", () => {
    expect(isOnboardingStage("not-a-stage")).toBe(false);
    expect(isOnboardingStage("attribution")).toBe(true);
  });
});
