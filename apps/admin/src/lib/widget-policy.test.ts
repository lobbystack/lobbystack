import { describe, expect, it } from "vitest";

import { buildWidgetRateLimits } from "./widget-policy";

const keyFor = (operation: "config" | "chat", name: string) =>
  buildWidgetRateLimits({ businessId: "business", widgetKeyId: "key", operation }).find((entry) => entry.name === `${operation}-${name}`)!.key;

describe("widget policy", () => {
  it("gives chat its own per-key counters so widget opens do not spend the chat budget", () => {
    expect(keyFor("chat", "key-minute")).not.toBe(keyFor("config", "key-minute"));
    expect(keyFor("chat", "key-hour")).not.toBe(keyFor("config", "key-hour"));
  });

  it("has no platform-wide counter shared by every business", () => {
    const first = buildWidgetRateLimits({ businessId: "first", widgetKeyId: "key", operation: "chat" }).map((entry) => entry.key);
    const second = buildWidgetRateLimits({ businessId: "second", widgetKeyId: "key", operation: "chat" }).map((entry) => entry.key);
    expect(first.filter((key) => second.includes(key))).toEqual([]);
  });
});
