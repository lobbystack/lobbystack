import { describe, expect, it } from "vitest";

import { widgetConfigSchema } from "./index";
import { apiWidgetConfigSchema } from "./publicApi/schemas";

describe("retired bottom-center widget position", () => {
  it("reads a widget saved at bottom center as bottom right and keeps the rest of its look", () => {
    expect(widgetConfigSchema.parse({ position: "bottom-center", color: "#112233" })).toMatchObject({ position: "bottom-right", color: "#112233" });
  });

  it("lets an API caller that still sends bottom center get bottom right", () => {
    expect(apiWidgetConfigSchema.parse({ position: "bottom-center" })).toMatchObject({ position: "bottom-right" });
  });

  it("still rejects positions that never existed", () => {
    expect(widgetConfigSchema.safeParse({ position: "top" }).success).toBe(false);
  });
});

describe("widget colors", () => {
  it("accepts the hex lengths browsers draw and rejects the five- and seven-digit look-alikes", () => {
    for (const color of ["#123", "#1234", "#123456", "#12345678"]) expect(widgetConfigSchema.safeParse({ color }).success).toBe(true);
    for (const color of ["#12345", "#1234567", "#12", "#123456789", "123456"]) expect(widgetConfigSchema.safeParse({ color }).success).toBe(false);
  });
});
