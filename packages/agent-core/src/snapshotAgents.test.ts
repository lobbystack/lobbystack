import { describe, expect, it, vi } from "vitest";

import { buildBusinessContextSnapshot, snapshotForAgent } from "@lobbystack/domain";

import { buildAgentInstructions, buildLiveInstructions } from "./instructions";
import { buildPhoneSessionConfig } from "./live/session";

const business: Parameters<typeof buildBusinessContextSnapshot>[0] = {
  businessId: "00000000-0000-4000-8000-000000000001",
  version: "v1",
  generatedAt: "2026-03-08T12:00:00.000Z",
  displayName: "Maple Family Clinic",
  timezone: "America/Toronto",
  defaultLocale: "en",
  businessType: "clinic",
  greeting: "Thank you for calling Maple Family Clinic.",
  voice: "cedar",
  tone: "warm",
  bookingPolicy: "Only confirm after booking.",
  bookingMode: "request",
  summary: "A family clinic.",
  hours: [{ dayOfWeek: 1, openMinutes: 540, closeMinutes: 1020 }],
  closures: [],
  services: [{ id: "00000000-0000-4000-8000-000000000002", name: "Checkup", durationMinutes: 30 }],
  rules: [{ id: "rule-1", title: "Parking", content: "Mention the rear lot.", order: 0 }],
  snippets: [],
  transferPolicy: { mode: "on_request", transferNumber: "+14165551234" },
  appointmentChangePolicy: { enabled: true, allowCancel: true, allowReschedule: false, verificationMode: "otp_required" },
};

// What refreshBusinessSnapshot writes for a business with one agent.
const today = buildBusinessContextSnapshot(business);
const withAgent = buildBusinessContextSnapshot({
  ...business,
  agents: [{
    id: "00000000-0000-4000-8000-000000000003",
    name: "Reception Desk",
    isDefault: true,
    greeting: business.greeting,
    tone: business.tone,
    voice: "cedar",
    bookingPolicy: business.bookingPolicy,
    bookingMode: "request",
    transferPolicy: business.transferPolicy,
    ...(business.appointmentChangePolicy ? { appointmentChangePolicy: business.appointmentChangePolicy } : {}),
    ...(business.rules ? { rules: business.rules } : {}),
  }],
});
const projected = snapshotForAgent(withAgent, withAgent.agents?.[0]?.id)!;

describe("a business with a single agent", () => {
  it.each([["the flat fields", withAgent], ["the projected agent", projected]])("gets a byte-identical phone prompt from %s", (_label, snapshot) => {
    expect(buildLiveInstructions(snapshot, "voice")).toBe(buildLiveInstructions(today, "voice"));
    expect(buildPhoneSessionConfig(snapshot)).toEqual(buildPhoneSessionConfig(today));
  });

  it.each(["voice", "web_voice", "web_chat", "sms"] as const)("gets the same backend instructions on %s", (channel) => {
    vi.useFakeTimers({ now: new Date("2026-03-09T15:00:00.000Z") });
    expect(buildAgentInstructions(projected, { channel })).toBe(buildAgentInstructions(today, { channel }));
    vi.useRealTimers();
  });

  it("never puts the agent's name in a prompt", () => {
    expect(buildLiveInstructions(projected, "voice")).not.toContain("Reception Desk");
    expect(buildAgentInstructions(projected, { channel: "voice" })).not.toContain("Reception Desk");
  });
});
