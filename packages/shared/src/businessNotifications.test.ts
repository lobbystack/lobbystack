import { describe, expect, it } from "vitest";

import { BUSINESS_NOTIFICATION_KINDS, BUSINESS_NOTIFICATION_RULES, isBusinessNotificationKind, orderBusinessNotifications } from "./businessNotifications";

describe("bell notifications", () => {
  it("list action required first, then newest first", () => {
    const items = [
      { id: "a", category: "update" as const, occurredAt: "2026-11-10T12:00:00.000Z" },
      { id: "b", category: "action" as const, occurredAt: "2026-11-01T12:00:00.000Z" },
      { id: "c", category: "action" as const, occurredAt: "2026-11-09T12:00:00.000Z" },
      { id: "d", category: "update" as const, occurredAt: "2026-11-11T12:00:00.000Z" },
    ];
    expect(orderBusinessNotifications(items).map((item) => item.id)).toEqual(["c", "b", "d", "a"]);
  });

  it("give every kind a rule, and open every action item on a dashboard page", () => {
    for (const kind of BUSINESS_NOTIFICATION_KINDS) {
      const rule = BUSINESS_NOTIFICATION_RULES[kind];
      expect(rule, kind).toBeDefined();
      if (rule.category === "action") expect(rule.href, kind).toMatch(/^\/[a-z]/);
    }
    expect(BUSINESS_NOTIFICATION_RULES.product_update.category).toBe("update");
    expect(isBusinessNotificationKind("payment_failed")).toBe(true);
    expect(isBusinessNotificationKind("call_completed")).toBe(false);
  });
});
