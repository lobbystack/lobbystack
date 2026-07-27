import { describe, expect, it } from "vitest";

import { createWebRealtimeToolDefinitions } from "./toolDefinitions";

describe("createWebRealtimeToolDefinitions", () => {
  it("exposes booking tools for standard web calls", () => {
    const names = createWebRealtimeToolDefinitions().map((tool) => tool.name);
    expect(names).toContain("bookAppointment");
    expect(names).toContain("findAvailability");
    expect(names).toContain("checkAvailability");
  });

  it("limits prospect demos to intake-only tools", () => {
    const names = createWebRealtimeToolDefinitions({
      sessionMode: "prospect_demo",
    }).map((tool) => tool.name);
    expect(names).toEqual([
      "waitForUser",
      "getBusinessHours",
      "getBusinessServices",
      "searchKnowledge",
      "takeMessage",
      "endCall",
    ]);
  });
});
