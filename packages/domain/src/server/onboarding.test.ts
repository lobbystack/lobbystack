import { describe, expect, it } from "vitest";

import { canVisitOnboardingStage, isOnboardingStage, isValidOnboardingTransition, normalizeOnboardingStage, resolveOnboardingRoute, resolveOnboardingStageForPlan, selectPreferredMembership } from "./onboarding";

describe("onboarding stages", () => {
  it("maps persisted stages to their dedicated routes", () => {
    expect(resolveOnboardingRoute("plan")).toBe("/onboarding/plan");
    expect(resolveOnboardingRoute("phone_number_claiming")).toBe("/onboarding/number");
    expect(resolveOnboardingRoute("complete")).toBe("/");
  });

  it("normalizes retired verification stages forward to plan", () => {
    expect(normalizeOnboardingStage("verify_phone")).toBe("plan");
    expect(normalizeOnboardingStage("verify_phone_code")).toBe("plan");
    expect(resolveOnboardingRoute("verify_phone")).toBe("/onboarding/plan");
    expect(resolveOnboardingRoute("verify_phone_code")).toBe("/onboarding/plan");
    expect(normalizeOnboardingStage("not-a-stage")).toBe("create_business");
  });

  it("allows only adjacent transitions, with an explicit number-selection skip", () => {
    expect(isValidOnboardingTransition("website", "knowledge")).toBe(true);
    expect(isValidOnboardingTransition("plan", "attribution")).toBe(true);
    expect(isValidOnboardingTransition("greeting", "plan")).toBe(true);
    expect(isValidOnboardingTransition("greeting", "knowledge")).toBe(false);
    expect(isValidOnboardingTransition("website", "plan")).toBe(false);
    expect(isValidOnboardingTransition("complete", "website")).toBe(false);
  });

  it("rejects unknown persisted values", () => {
    expect(isOnboardingStage("not-a-stage")).toBe(false);
    expect(isOnboardingStage("toString")).toBe(false);
    expect(isOnboardingStage("constructor")).toBe(false);
    expect(isOnboardingStage("verify_phone")).toBe(false);
    expect(isOnboardingStage("attribution")).toBe(true);
  });

  it("allows completed and later stages to revisit every reached step", () => {
    expect(canVisitOnboardingStage("plan", "knowledge")).toBe(true);
    expect(canVisitOnboardingStage("plan", "phone_number")).toBe(false);
    expect(canVisitOnboardingStage("phone_number_claiming", "phone_number")).toBe(true);
    expect(canVisitOnboardingStage("complete", "attribution")).toBe(true);
    expect(canVisitOnboardingStage("complete", "create_business")).toBe(true);
  });
});

describe("original legacy plan-stage navigation", () => {
  it.each(["phone_number", "phone_number_claiming"] as const)("returns free-plan %s stages to plan selection", stage => {
    expect(resolveOnboardingStageForPlan(stage, "free_cloud")).toBe("plan");
    expect(resolveOnboardingStageForPlan(stage, "starter")).toBe(stage);
    expect(resolveOnboardingStageForPlan(stage, "self_host")).toBe(stage);
  });
  it("preserves completed onboarding on the free plan", () => {
    expect(resolveOnboardingStageForPlan("complete", "free_cloud")).toBe("complete");
  });
});

describe("active business fallback", () => {
  it("prefers an operable membership over a viewer membership", () => {
    expect(selectPreferredMembership([{ business_id: "a", role: "viewer" }, { business_id: "b", role: "business_owner" }])?.business_id).toBe("b");
  });
  it("uses the first membership when every membership is a viewer", () => {
    expect(selectPreferredMembership([{ business_id: "a", role: "viewer" }, { business_id: "b", role: "viewer" }])?.business_id).toBe("a");
  });
  it("returns undefined when the user has no active membership", () => {
    expect(selectPreferredMembership([])).toBeUndefined();
  });
});
