import { describe, expect, it } from "vitest";
import { resolveCallOutcome } from "./callOutcome";
describe("call outcome display states", () => {
  it("preserves confirmed booking facts over message taking and summaries", () => {
    expect(resolveCallOutcome({ persisted: { kind: "booked", serviceName: "Consultation", startsAt: "2027-01-01T10:00:00Z" }, currentIntent: "message_taking", summary: "Generic summary" })).toEqual({ kind: "booked", serviceName: "Consultation", startsAt: "2027-01-01T10:00:00Z" });
  });
  it("retains imported scheduling state without inventing a time", () => {
    expect(resolveCallOutcome({ persisted: { kind: "booking_in_progress", serviceName: "Consultation" } })).toEqual({ kind: "booking_in_progress", serviceName: "Consultation", startsAt: null });
  });
  it("rejects malformed dates and legacy placeholder summaries", () => {
    expect(resolveCallOutcome({ persisted: { kind: "booked", startsAt: "invalid" }, summary: "Business old conversation", disposition: "call_busy" })).toEqual({ kind: "disposition", disposition: "call_busy" });
  });
  it("uses message-taking, summary, disposition, then empty states", () => {
    expect(resolveCallOutcome({ currentIntent: "message_taking", summary: "Call back" })).toEqual({ kind: "message_taking" });
    expect(resolveCallOutcome({ summary: " Questions about hours ", disposition: "completed" })).toEqual({ kind: "summary", summary: "Questions about hours" });
    expect(resolveCallOutcome({ summary: "call_busy", disposition: "call_busy" })).toEqual({ kind: "disposition", disposition: "call_busy" });
    expect(resolveCallOutcome({})).toEqual({ kind: "none" });
  });
});
