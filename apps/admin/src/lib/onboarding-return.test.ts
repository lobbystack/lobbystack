import { describe, expect, it } from "vitest";

import { onboardingReturnTarget } from "./onboarding-return";

const first = { businessId: "first", active: false, onboardingStage: "complete", createdAt: "2026-01-01T00:00:00.000Z" };
const second = { businessId: "second", active: false, onboardingStage: "complete", createdAt: "2026-06-01T00:00:00.000Z" };
const fresh = { businessId: "new", active: true, onboardingStage: "phone_number", createdAt: "2026-11-01T00:00:00.000Z" };

describe("onboardingReturnTarget", () => {
  it("goes back to the workspace the person came from", () => {
    expect(onboardingReturnTarget([first, second, fresh], "first")?.businessId).toBe("first");
  });

  it("falls back to the most recently created finished workspace", () => {
    expect(onboardingReturnTarget([first, second, fresh], null)?.businessId).toBe("second");
    expect(onboardingReturnTarget([first, second, fresh], "gone")?.businessId).toBe("second");
  });

  it("stays in a finished active workspace, as before its new one exists", () => {
    expect(onboardingReturnTarget([{ ...first, active: true }, second], null)?.businessId).toBe("first");
  });

  it("offers nothing to someone with no finished workspace", () => {
    expect(onboardingReturnTarget([fresh], "first")).toBeNull();
    expect(onboardingReturnTarget([], null)).toBeNull();
    expect(onboardingReturnTarget(undefined, null)).toBeNull();
  });
});
