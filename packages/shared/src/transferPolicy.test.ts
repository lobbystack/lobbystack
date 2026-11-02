import { describe, expect, it } from "vitest";
import { isBusinessOpen, isTransferPermitted, normalizeTransferMode, shouldRingStaffFirst } from "./transferPolicy";
import { demoSnapshot, normalizeAppointmentChangePolicy, type TransferPolicy } from "./index";

const snapshot = (mode: TransferPolicy["mode"]) => ({ ...demoSnapshot, timezone: "America/Toronto", transferPolicy: { mode, transferNumber: "+14165550100" }, hours: [{ dayOfWeek: 5, openMinutes: 540, closeMinutes: 1020 }], closures: [] });
describe("live transfer policy", () => {
  it.each(["never", "always", "on_request", "on_urgent", "during_business_hours"] as const)("preserves %s", (mode) => expect(normalizeTransferMode(mode)).toBe(mode));
  it("fails closed on unknown persisted modes", () => expect(normalizeTransferMode("corrupt")).toBe("never"));
  it("requires explicit evidence and blocks automatic conditional fallbacks", () => {
    expect(isTransferPermitted(snapshot("on_request"))).toBe(false);
    expect(isTransferPermitted(snapshot("on_request"), { urgent: true })).toBe(false);
    expect(isTransferPermitted(snapshot("on_request"), { callerRequested: true })).toBe(true);
    expect(isTransferPermitted(snapshot("on_urgent"), { callerRequested: true })).toBe(false);
    expect(isTransferPermitted(snapshot("on_urgent"), { urgent: true })).toBe(true);
    expect(isTransferPermitted(snapshot("never"), { urgent: true, callerRequested: true })).toBe(false);
    expect(isTransferPermitted(snapshot("always"))).toBe(true);
    expect(isTransferPermitted({ ...snapshot("always"), transferPolicy: { mode: "always" } })).toBe(false);
  });
  it("uses local hours and exclusive closing boundaries", () => {
    const business = snapshot("during_business_hours");
    expect(isTransferPermitted(business, { now: new Date("2026-09-04T12:59:00Z") })).toBe(false);
    expect(isTransferPermitted(business, { now: new Date("2026-09-04T13:00:00Z") })).toBe(true);
    expect(isTransferPermitted(business, { now: new Date("2026-09-04T21:00:00Z") })).toBe(false);
    expect(isTransferPermitted(business, { now: new Date("2026-09-05T14:00:00Z") })).toBe(false);
  });
  it("honors closures and overnight windows", () => {
    const business = { ...snapshot("during_business_hours"), hours: [{ dayOfWeek: 5, openMinutes: 1320, closeMinutes: 120 }] };
    const now = new Date("2026-09-05T05:00:00Z");
    expect(isTransferPermitted(business, { now })).toBe(true);
    expect(isTransferPermitted({ ...business, closures: [{ startsAt: "2026-09-05T04:00:00Z", endsAt: "2026-09-05T06:00:00Z", reason: "Closed" }] }, { now })).toBe(false);
    expect(isTransferPermitted({ ...business, timezone: "invalid" }, { now })).toBe(false);
  });
  it("tells whether the business is open, whatever its transfer rule", () => {
    const business = snapshot("never");
    expect(isBusinessOpen(business, new Date("2026-09-04T13:00:00Z"))).toBe(true);
    expect(isBusinessOpen(business, new Date("2026-09-04T21:00:00Z"))).toBe(false);
    expect(isBusinessOpen({ ...business, closures: [{ startsAt: "2026-09-04T12:00:00Z", endsAt: "2026-09-04T14:00:00Z", reason: "Closed" }] }, new Date("2026-09-04T13:00:00Z"))).toBe(false);
    expect(isBusinessOpen({ ...business, hours: [] }, new Date("2026-09-04T13:00:00Z"))).toBe(false);
  });
});


describe("stored appointment policy", () => {
  it("retains legacy defaults only when no policy exists", () => {
    expect(normalizeAppointmentChangePolicy(null).enabled).toBe(true);
    expect(normalizeAppointmentChangePolicy({ allowCancel: true }).enabled).toBe(false);
    expect(normalizeAppointmentChangePolicy({ enabled: true, allowCancel: true, allowReschedule: true, verificationMode: "unknown" }).verificationMode).toBe("operator_only");
  });
});

describe("shouldRingStaffFirst", () => {
  const hours = { timezone: "America/Toronto", hours: [{ dayOfWeek: 1, openMinutes: 9 * 60, closeMinutes: 17 * 60 }], closures: [] };
  const staffFirstPolicy = { mode: "business_hours" as const, number: "+14165550100", ringSeconds: 15 };
  // Monday 2026-11-02 at 10:00 and 20:00 in Toronto.
  const open = new Date("2026-11-02T15:00:00Z");
  const closed = new Date("2026-11-03T01:00:00Z");

  it("rings during business hours in business_hours mode", () => {
    expect(shouldRingStaffFirst({ ...hours, staffFirstPolicy }, open)).toBe(true);
    expect(shouldRingStaffFirst({ ...hours, staffFirstPolicy }, closed)).toBe(false);
  });

  it("skips a closure inside business hours", () => {
    expect(shouldRingStaffFirst({ ...hours, staffFirstPolicy, closures: [{ startsAt: "2026-11-02T14:00:00.000Z", endsAt: "2026-11-02T16:00:00.000Z", reason: "Staff day" }] }, open)).toBe(false);
  });

  it("rings at any time in always mode", () => {
    expect(shouldRingStaffFirst({ ...hours, staffFirstPolicy: { ...staffFirstPolicy, mode: "always" } }, closed)).toBe(true);
  });

  it("doesn't ring without a policy", () => {
    expect(shouldRingStaffFirst(hours, open)).toBe(false);
  });
});
