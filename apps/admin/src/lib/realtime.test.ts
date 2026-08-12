import { describe, expect, it } from "vitest";

import { parseRealtimeMessage } from "./realtime";

const businessId = "11111111-1111-4111-8111-111111111111";
const event = {
  id: "22222222-2222-4222-8222-222222222222",
  type: "call.updated",
  businessId,
  entityId: "33333333-3333-4333-8333-333333333333",
  occurredAt: "2026-08-10T12:00:00.000Z",
  payload: {},
  trace: {},
};

describe("realtime message parsing", () => {
  it("accepts valid events for the subscribed business", () => {
    expect(parseRealtimeMessage(JSON.stringify(event), businessId)).toEqual(event);
  });

  it("drops malformed and cross-business messages", () => {
    expect(parseRealtimeMessage("not-json", businessId)).toBeNull();
    expect(parseRealtimeMessage(JSON.stringify({ ...event, businessId: "44444444-4444-4444-8444-444444444444" }), businessId)).toBeNull();
  });
});
