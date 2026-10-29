import { describe, expect, it } from "vitest";

import { cancellationRequestDetails, formatRequestedStart, parseCancellationBody } from "./follow-up-task";

describe("formatRequestedStart", () => {
  it("shows the business's wall-clock date in the viewer's language", () => {
    expect(formatRequestedStart("2026-11-04", "en")).toBe("Wednesday, November 4");
    expect(formatRequestedStart("2026-11-04", "fr")).toBe("mercredi 4 novembre");
  });

  it("adds the time without shifting it to the viewer's timezone", () => {
    expect(formatRequestedStart("2026-11-04T10:00", "en")).toContain("10:00");
    expect(formatRequestedStart("2026-11-04T10:00", "sr")).toContain("10:00");
  });

  it("keeps a value it can't read as written", () => {
    expect(formatRequestedStart("next Tuesday", "en")).toBe("next Tuesday");
  });
});

describe("cancellationRequestDetails", () => {
  it("reads the saved service, time and notes", () => {
    expect(cancellationRequestDetails({ body: "Cancellation request: x", requested: { service: "Haircut", startsAt: "2026-11-04", notes: "Caller is ill" } }, "en"))
      .toEqual({ requested: "Haircut, Wednesday, November 4", notes: "Caller is ill" });
  });

  it("falls back to the English body for requests saved before the details existed", () => {
    const body = "Cancellation request: Haircut, Wednesday, November 4\nNotes: Caller is ill";
    expect(cancellationRequestDetails({ body }, "fr")).toEqual({ requested: "Haircut, Wednesday, November 4", notes: "Caller is ill" });
    expect(parseCancellationBody("Cancellation request: appointment")).toEqual({});
  });
});
