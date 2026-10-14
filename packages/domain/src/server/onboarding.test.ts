import { describe, expect, it } from "vitest";

import { canVisitOnboardingStage, isOnboardingStage, isValidOnboardingTransition, normalizeOnboardingStage, resolveOnboardingRoute, selectPreferredMembership } from "./onboarding";

describe("onboarding stages", () => {
  it("maps persisted stages to their dedicated routes", () => {
    expect(resolveOnboardingRoute("test_call")).toBe("/onboarding/test-call");
    expect(resolveOnboardingRoute("verify_phone")).toBe("/onboarding/verify-phone");
    expect(resolveOnboardingRoute("phone_number_claiming")).toBe("/onboarding/number");
    expect(resolveOnboardingRoute("complete")).toBe("/");
  });

  it("resumes retired stages at the nearest step that still exists", () => {
    expect(normalizeOnboardingStage("plan")).toBe("test_call");
    expect(normalizeOnboardingStage("verify_phone_code")).toBe("verify_phone");
    expect(resolveOnboardingRoute("plan")).toBe("/onboarding/test-call");
    expect(normalizeOnboardingStage("not-a-stage")).toBe("create_business");
  });

  it("asks for no plan: the owner hears the agent, verifies a phone, then picks a number", () => {
    expect(isValidOnboardingTransition("create_business", "website")).toBe(true);
    expect(isValidOnboardingTransition("website", "knowledge")).toBe(true);
    expect(isValidOnboardingTransition("greeting", "test_call")).toBe(true);
    expect(isValidOnboardingTransition("test_call", "verify_phone")).toBe(true);
    expect(isValidOnboardingTransition("verify_phone", "phone_number")).toBe(true);
    // A country without numbers skips the number step.
    expect(isValidOnboardingTransition("verify_phone", "attribution")).toBe(true);
    expect(isValidOnboardingTransition("test_call", "phone_number")).toBe(false);
    expect(isValidOnboardingTransition("greeting", "knowledge")).toBe(false);
    expect(isValidOnboardingTransition("complete", "website")).toBe(false);
  });

  it("rejects unknown persisted values", () => {
    expect(isOnboardingStage("not-a-stage")).toBe(false);
    expect(isOnboardingStage("toString")).toBe(false);
    expect(isOnboardingStage("constructor")).toBe(false);
    expect(isOnboardingStage("plan")).toBe(false);
    expect(isOnboardingStage("verify_phone")).toBe(true);
    expect(isOnboardingStage("attribution")).toBe(true);
  });

  it("allows completed and later stages to revisit every reached step", () => {
    expect(canVisitOnboardingStage("create_business", "website")).toBe(false);
    expect(canVisitOnboardingStage("website", "website")).toBe(true);
    expect(canVisitOnboardingStage("verify_phone", "test_call")).toBe(true);
    expect(canVisitOnboardingStage("verify_phone", "phone_number")).toBe(false);
    expect(canVisitOnboardingStage("phone_number_claiming", "phone_number")).toBe(true);
    expect(canVisitOnboardingStage("complete", "attribution")).toBe(true);
    expect(canVisitOnboardingStage("complete", "create_business")).toBe(true);
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
