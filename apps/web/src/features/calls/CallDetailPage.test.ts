import { describe, expect, it } from "vitest";

import { resolveCallStatus } from "@/features/calls/CallDetailPage";

describe("resolveCallStatus", () => {
  it("treats busy, canceled, and no-answer dispositions as failed terminal outcomes", () => {
    expect(resolveCallStatus({ status: "completed", disposition: "call_busy" } as never)).toBe("failed");
    expect(resolveCallStatus({ status: "completed", disposition: "call_canceled" } as never)).toBe("failed");
    expect(resolveCallStatus({ status: "completed", disposition: "call_no_answer" } as never)).toBe("failed");
  });

  it("keeps normal completed calls as completed", () => {
    expect(resolveCallStatus({ status: "completed", disposition: "call_completed" } as never)).toBe("completed");
  });
});
