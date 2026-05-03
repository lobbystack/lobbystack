import { describe, expect, it } from "vitest";

import {
  buildCallEvents,
  callReachedConnectedStep,
  isContactBlockedCall,
  resolveCallStatus,
} from "@/features/calls/CallDetailPage";

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

  it("keeps blocked calls as terminal completed outcomes", () => {
    expect(resolveCallStatus({ status: "completed", disposition: "contact_blocked" } as never)).toBe("completed");
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

  it("does not mark blocked calls as connected", () => {
    expect(callReachedConnectedStep({ status: "completed", disposition: "contact_blocked" } as never)).toBe(false);
  });

  it("keeps answered or active calls connected", () => {
    expect(callReachedConnectedStep({ status: "completed", disposition: "call_completed" } as never)).toBe(true);
    expect(callReachedConnectedStep({ status: "in_progress", disposition: "call_busy" } as never)).toBe(true);
  });
});

describe("isContactBlockedCall", () => {
  it("detects blocked contact call dispositions", () => {
    expect(isContactBlockedCall({ disposition: "contact_blocked" })).toBe(true);
    expect(isContactBlockedCall({ disposition: "call_completed" })).toBe(false);
  });
});

describe("buildCallEvents", () => {
  it("renders blocked calls as received then blocked without a connected step", () => {
    const events = buildCallEvents({
      status: "completed",
      disposition: "contact_blocked",
      startedAt: "2026-05-03T19:56:59.264Z",
      endedAt: "2026-05-03T19:56:59.000Z",
    } as never);

    expect(events.map((event) => event.key)).toEqual(["received", "blocked"]);
    expect(events.at(-1)).toMatchObject({
      key: "blocked",
      failed: true,
    });
  });
});
