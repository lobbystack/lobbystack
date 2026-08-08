import { describe, expect, it } from "vitest";

import {
  outboxMessageInputSchema,
  outboxStatusSchema,
} from "./outbox";

describe("outbox helpers", () => {
  it("validates outbox message input", () => {
    const parsed = outboxMessageInputSchema.parse({
      businessId: "550e8400-e29b-41d4-a716-446655440000",
      topic: "appointment.created",
      payload: { appointmentId: "abc" },
      dedupeKey: "appointment.created:abc",
    });

    expect(parsed.topic).toBe("appointment.created");
    expect(parsed.payload).toEqual({ appointmentId: "abc" });
  });

  it("rejects invalid business ids", () => {
    expect(() =>
      outboxMessageInputSchema.parse({
        businessId: "not-a-uuid",
        topic: "appointment.created",
        payload: {},
      }),
    ).toThrow();
  });

  it("accepts known outbox statuses", () => {
    expect(outboxStatusSchema.parse("pending")).toBe("pending");
    expect(outboxStatusSchema.parse("completed")).toBe("completed");
  });
});
