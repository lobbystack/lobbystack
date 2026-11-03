import { describe, expect, it } from "vitest";

import { isSetupGuideFinished, isSetupStepDone, numberPath, SETUP_STEP_ORDER, showsSetupGuide, type SetupStep } from "./setup-guide";

const owner = { canSetUp: true, role: "business_owner" };

describe("showsSetupGuide", () => {
  it("shows the guide to an owner or admin who can set up", () => {
    expect(showsSetupGuide(owner)).toBe(true);
    expect(showsSetupGuide({ canSetUp: true, role: "business_admin" })).toBe(true);
  });

  it.each([
    ["a viewer", { canSetUp: true, role: "viewer" }],
    ["a scheduler", { canSetUp: true, role: "scheduler" }],
    ["an owner of an activity-only business", { canSetUp: false, role: "business_owner" }],
    ["an admin of an activity-only business", { canSetUp: false, role: "business_admin" }],
  ])("keeps the normal Home for %s", (_who, access) => {
    expect(showsSetupGuide(access)).toBe(false);
  });
});

describe("finishing the guide", () => {
  const steps = (status: Partial<Record<SetupStep["id"], string>> = {}): SetupStep[] => SETUP_STEP_ORDER.map((id) => ({ id, status: status[id] ?? "complete" }));

  it("never finishes the number step for having a number, since forwarding can't be seen", () => {
    expect(isSetupStepDone({ id: "phoneNumber", status: "complete" }, [])).toBe(false);
    expect(isSetupStepDone({ id: "phoneNumber", status: "complete" }, ["phoneNumber"])).toBe(true);
    expect(isSetupStepDone({ id: "sources", status: "complete" }, [])).toBe(true);
    expect(isSetupStepDone({ id: "sources", status: "skipped" }, ["sources"])).toBe(true);
    expect(isSetupStepDone({ id: "sources", status: "needs setup" }, [])).toBe(false);
  });

  it("keeps the list after every step gets done without a skip", () => {
    expect(isSetupGuideFinished({ steps: steps(), skippedSteps: [] })).toBe(false);
  });

  it("keeps the number step for someone who skipped other steps", () => {
    expect(isSetupGuideFinished({ steps: steps({ fullScan: "skipped", sources: "skipped" }), skippedSteps: ["fullScan", "sources"] })).toBe(false);
  });

  it("ends once every step is skipped, and a step that got done still counts as skipped", () => {
    expect(isSetupGuideFinished({ steps: steps({ sources: "skipped", testCall: "skipped" }), skippedSteps: ["fullScan", "sources", "testCall", "phoneNumber"] })).toBe(true);
  });

  it("holds out while a step needs setup", () => {
    expect(isSetupGuideFinished({ steps: steps({ sources: "needs setup" }), skippedSteps: ["phoneNumber"] })).toBe(false);
  });
});

describe("numberPath", () => {
  const direct = { partnerNumbers: null, trialAvailable: false, includedNumbers: 0 };

  it("offers a free business its trial, and a plan once it can't have one", () => {
    expect(numberPath({ ...direct, trialAvailable: true })).toBe("trial");
    expect(numberPath(direct)).toBe("plan");
  });

  it("lets a plan with a number claim it, including a plan with no limit", () => {
    expect(numberPath({ ...direct, includedNumbers: 1 })).toBe("claim");
    expect(numberPath({ ...direct, includedNumbers: null })).toBe("claim");
  });

  it("offers nothing to buy to someone who can't read billing", () => {
    expect(numberPath({ ...direct, includedNumbers: undefined })).toBe("unavailable");
  });

  it("follows the partner's tier for a partner's business", () => {
    expect(numberPath({ ...direct, partnerNumbers: { available: true } })).toBe("claim");
    expect(numberPath({ ...direct, partnerNumbers: { available: true, trial: true, phoneVerified: false } })).toBe("verify");
    expect(numberPath({ ...direct, partnerNumbers: { available: false, refusal: "partner_number_limit_reached" } })).toBe("partnerLimit");
    expect(numberPath({ ...direct, partnerNumbers: { available: false } })).toBe("partnerUnavailable");
  });
});
