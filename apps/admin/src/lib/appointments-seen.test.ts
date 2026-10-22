// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { countNewAppointments, markAppointmentsSeen, readAppointmentsSeenAt } from "./appointments-seen";

afterEach(() => window.localStorage.clear());

describe("new appointments badge", () => {
  const rows = [{ createdAt: "2026-10-16T09:00:00Z" }, { createdAt: "2026-10-16T11:00:00Z" }, {}];

  it("counts only bookings made after the owner last looked", () => {
    expect(countNewAppointments(rows, Date.parse("2026-10-16T10:00:00Z"))).toBe(1);
    expect(countNewAppointments(rows, Date.parse("2026-10-16T12:00:00Z"))).toBe(0);
  });

  it("shows nothing before the first visit is recorded", () => {
    expect(countNewAppointments(rows, null)).toBe(0);
  });

  it("remembers the last visit per business", () => {
    markAppointmentsSeen("a", 1_000);
    expect(readAppointmentsSeenAt("a")).toBe(1_000);
    expect(readAppointmentsSeenAt("b")).toBeNull();
  });
});
