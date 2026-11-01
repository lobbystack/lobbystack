import { describe, expect, it } from "vitest";

import { currentStage, numberPath, showsNewAccountHome, teachTasks } from "./new-account-home";

const owner = { canSetUp: true, role: "business_owner" };

describe("showsNewAccountHome", () => {
  it("shows the new-account view until the first real conversation, and not after", () => {
    expect(showsNewAccountHome({ ...owner, firstRealConversationAt: null })).toBe(true);
    expect(showsNewAccountHome({ ...owner, firstRealConversationAt: "2026-11-01T12:00:00.000Z" })).toBe(false);
  });

  it("keeps the normal Home while it doesn't know", () => {
    expect(showsNewAccountHome({ ...owner, firstRealConversationAt: undefined })).toBe(false);
  });

  it.each([
    ["a viewer", { canSetUp: true, role: "viewer" }],
    ["a scheduler", { canSetUp: true, role: "scheduler" }],
    ["an owner of an activity-only business", { canSetUp: false, role: "business_owner" }],
    ["an admin of an activity-only business", { canSetUp: false, role: "business_admin" }],
  ])("keeps the normal Home for %s", (_who, access) => {
    expect(showsNewAccountHome({ ...access, firstRealConversationAt: null })).toBe(false);
  });
});

describe("currentStage", () => {
  it("opens the first stage not done, and ends on the number", () => {
    expect(currentStage({ hear: false, teach: true })).toBe("hear");
    expect(currentStage({ hear: true, teach: false })).toBe("teach");
    expect(currentStage({ hear: true, teach: true })).toBe("number");
  });
});

describe("teachTasks", () => {
  it("puts the goal's own task first", () => {
    expect(teachTasks("book_appointments", false)[0]).toBe("calendar");
    expect(teachTasks("answer_instagram_messages", false)[0]).toBe("instagram");
    expect(teachTasks("answer_website_visitors", true)[0]).toBe("widget");
  });

  it("leaves the widget out where this deployment can't issue one", () => {
    expect(teachTasks("answer_website_visitors", false)).not.toContain("widget");
  });

  it("falls back to the phone tasks with no goal", () => {
    expect(teachTasks(null, true)).toEqual(teachTasks("answer_calls", true));
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
