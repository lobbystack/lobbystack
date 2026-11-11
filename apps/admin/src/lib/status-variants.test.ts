import { describe, expect, it } from "vitest";

import { appointmentStatusVariant, callOutcomeVariant, knowledgeStatusVariant, webhookDeliveryStatusVariant } from "./status-variants";

describe("status variants", () => {
  it("reads both spellings of a cancelled appointment as danger", () => {
    expect(appointmentStatusVariant("canceled")).toBe("danger");
    expect(appointmentStatusVariant("Cancelled")).toBe("danger");
    expect(appointmentStatusVariant("confirmed")).toBe("success");
  });

  it("falls back to neutral for a value the map doesn't know", () => {
    expect(appointmentStatusVariant("rescheduled")).toBe("neutral");
    expect(webhookDeliveryStatusVariant(null)).toBe("neutral");
  });

  it("maps knowledge and call states", () => {
    expect(knowledgeStatusVariant("processing")).toBe("info");
    expect(knowledgeStatusVariant("error")).toBe("danger");
    expect(callOutcomeVariant("blocked")).toBe("danger");
  });
});
