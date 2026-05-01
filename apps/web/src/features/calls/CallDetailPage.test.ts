import { describe, expect, it } from "vitest";

import { callReachedConnectedStep, resolveCallStatus } from "@/features/calls/CallDetailPage";

describe("resolveCallStatus", () => {
  it("treats open calls as still live", () => {
    expect(resolveCallStatus({ status: "open", disposition: undefined } as never)).toBe("in_progress");
  });

  it("treats busy, canceled, and no-answer dispositions as failed terminal outcomes", () => {
    expect(resolveCallStatus({ status: "completed", disposition: "call_busy" } as never)).toBe("failed");
    expect(resolveCallStatus({ status: "completed", disposition: "call_canceled" } as never)).toBe("failed");
    expect(resolveCallStatus({ status: "completed", disposition: "call_no_answer" } as never)).toBe("failed");
  });

  it("keeps normal completed calls as completed", () => {
    expect(resolveCallStatus({ status: "completed", disposition: "call_completed" } as never)).toBe("completed");
  });

  it("keeps AI-ended spam calls as completed terminal outcomes", () => {
    expect(resolveCallStatus({ status: "completed", disposition: "spam_ended" } as never)).toBe("completed");
  });
});

describe("callReachedConnectedStep", () => {
  it("does not mark open calls as connected yet", () => {
    expect(callReachedConnectedStep({ status: "open", disposition: undefined } as never)).toBe(false);
  });

  it("does not mark unanswered terminal calls as connected", () => {
    expect(callReachedConnectedStep({ status: "completed", disposition: "call_busy" } as never)).toBe(false);
    expect(callReachedConnectedStep({ status: "completed", disposition: "call_canceled" } as never)).toBe(false);
    expect(callReachedConnectedStep({ status: "completed", disposition: "call_no_answer" } as never)).toBe(false);
  });

  it("keeps answered or active calls connected", () => {
    expect(callReachedConnectedStep({ status: "completed", disposition: "call_completed" } as never)).toBe(true);
    expect(callReachedConnectedStep({ status: "in_progress", disposition: "call_busy" } as never)).toBe(true);
  });
});
