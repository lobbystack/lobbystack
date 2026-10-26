import { describe, expect, it } from "vitest";

import { allowanceAlertsDue } from "./businessAllowanceAlerts";
import { stripeSyncStatusFor } from "./usage";

// Front desk: 10 minutes and 3 chats a month.
const frontDesk = { voiceSeconds: 600, chats: 3, alertSms: null, outboundAttempts: null };

describe("a business's allowance alerts", () => {
  it("are due at 80% and 100% of its minutes, rounded up to whole minutes, and of its chats", () => {
    expect(allowanceAlertsDue(frontDesk, { voiceSeconds: 420, chats: 2 }, {})).toEqual([]);
    expect(allowanceAlertsDue(frontDesk, { voiceSeconds: 421, chats: 2 }, {})).toEqual([{ kind: "minutes", threshold: 80, key: "minutes:80:600", covers: [] }]);
    expect(allowanceAlertsDue(frontDesk, { voiceSeconds: 600, chats: 3 }, { "minutes:80:600": "sent" })).toEqual([
      { kind: "minutes", threshold: 100, key: "minutes:100:600", covers: [] },
      // Two chats were 67%, so the third reaches 100% at once and marks 80% sent with it.
      { kind: "chats", threshold: 100, key: "chats:100:3", covers: ["chats:80:3"] },
    ]);
  });

  it("go out once a month, and again for an allowance of another size", () => {
    const sent = { "minutes:80:600": "sent", "minutes:100:600": "sent" };
    expect(allowanceAlertsDue(frontDesk, { voiceSeconds: 900, chats: 0 }, sent)).toEqual([]);
    expect(allowanceAlertsDue({ ...frontDesk, voiceSeconds: 1_200 }, { voiceSeconds: 1_000, chats: 0 }, sent)).toEqual([{ kind: "minutes", threshold: 80, key: "minutes:80:1200", covers: [] }]);
  });

  it("aren't due for an allowance with no limit, or none at all", () => {
    expect(allowanceAlertsDue({ ...frontDesk, voiceSeconds: null, chats: null }, { voiceSeconds: 10_000, chats: 100 }, {})).toEqual([]);
    expect(allowanceAlertsDue({ ...frontDesk, voiceSeconds: 0, chats: 0 }, { voiceSeconds: 60, chats: 1 }, {})).toEqual([]);
  });
});

describe("a business's overage on its partner's Stripe", () => {
  it("is pending while it differs from what Stripe was sent, and keeps its status otherwise", () => {
    expect(stripeSyncStatusFor({ quantity: 120, minor: 60 }, undefined)).toBe("pending");
    // Usage within the allowance has nothing to send.
    expect(stripeSyncStatusFor({ quantity: 0, minor: 0 }, undefined)).toBeNull();
    const synced = { stripeSyncStatus: "synced", stripeOverageReportedMinor: 60, stripeOverageSendingMinor: null };
    expect(stripeSyncStatusFor({ quantity: 120, minor: 60 }, synced)).toBe("synced");
    expect(stripeSyncStatusFor({ quantity: 180, minor: 90 }, synced)).toBe("pending");
    // A report still out counts as sent.
    expect(stripeSyncStatusFor({ quantity: 180, minor: 90 }, { stripeSyncStatus: "pending", stripeOverageReportedMinor: 60, stripeOverageSendingMinor: 30 })).toBe("pending");
    // Usage no package prices leaves the status as it was.
    expect(stripeSyncStatusFor(null, synced)).toBe("synced");
  });
});
