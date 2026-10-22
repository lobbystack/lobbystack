import { describe, expect, it } from "vitest";

import { buildWidgetLoaderRateLimits, buildWidgetRateLimits } from "./widget-policy";

const keyFor = (operation: "config" | "chat", name: string) =>
  buildWidgetRateLimits({ businessId: "business", widgetKeyId: "key", operation }).find((entry) => entry.name === `${operation}-${name}`)!.key;

describe("widget policy", () => {
  it("gives chat its own per-key counters so widget opens do not spend the chat budget", () => {
    expect(keyFor("chat", "key-minute")).not.toBe(keyFor("config", "key-minute"));
    expect(keyFor("chat", "key-hour")).not.toBe(keyFor("config", "key-hour"));
  });

  it("lets a few hundred chats on one key keep their live update streams open", () => {
    const max = (operation: "stream" | "config", name: string) => buildWidgetRateLimits({ businessId: "business", widgetKeyId: "key", operation }).find((entry) => entry.name === `${operation}-${name}`)!.limit;
    const chats = 500;
    // A Redis drop reopens every chat's stream within the same minute.
    expect(max("stream", "key-minute")).toBeGreaterThanOrEqual(chats);
    // Each chat reopens every 10 minutes, and again whenever its tab comes back into view.
    expect(max("stream", "key-hour")).toBeGreaterThanOrEqual(chats * 6 * 4);
    // Opening widgets keeps its own, smaller budget.
    expect(max("config", "key-minute")).toBe(180);
    expect(max("config", "key-hour")).toBe(1_000);
  });

  it("has no platform-wide counter shared by every business", () => {
    const first = buildWidgetRateLimits({ businessId: "first", widgetKeyId: "key", operation: "chat" }).map((entry) => entry.key);
    const second = buildWidgetRateLimits({ businessId: "second", widgetKeyId: "key", operation: "chat" }).map((entry) => entry.key);
    expect(first.filter((key) => second.includes(key))).toEqual([]);
  });

  it("limits the keyed loader's lookups per client address, or in one shared bucket without one", () => {
    const first = buildWidgetLoaderRateLimits({ ipHash: "first" });
    expect(first.map((entry) => [entry.name, entry.limit, entry.windowSeconds])).toEqual([["loader-ip-minute", 120, 60], ["loader-ip-hour", 1_200, 3_600]]);
    // Each address counts on its own, whatever key it asks for.
    expect(buildWidgetLoaderRateLimits({ ipHash: "second" }).map((entry) => entry.key).filter((key) => first.some((entry) => entry.key === key))).toEqual([]);
    const shared = buildWidgetLoaderRateLimits({});
    expect(shared.map((entry) => [entry.name, entry.limit])).toEqual([["loader-shared-minute", 3_000]]);
    // The loader's counters are its own, apart from the widget API's.
    const api = buildWidgetRateLimits({ businessId: "business", widgetKeyId: "key", ipHash: "first", operation: "config" }).map((entry) => entry.key);
    expect([...first, ...shared].filter((entry) => api.includes(entry.key))).toEqual([]);
  });
});
