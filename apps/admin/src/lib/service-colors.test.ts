import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { SERVICE_COLOR_COUNT, serviceColor, serviceColorClasses, serviceDotClass } from "./service-colors";

describe("service colors", () => {
  it("gives a service the same one of eight colors every time", () => {
    const id = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
    expect(serviceColor(id)).toBe(serviceColor(id));
    expect(serviceColor(id)).toBeGreaterThanOrEqual(1);
    expect(serviceColor(id)).toBeLessThanOrEqual(SERVICE_COLOR_COUNT);
    expect(serviceColorClasses(id)).toBe(`bg-calendar-${serviceColor(id)} text-calendar-${serviceColor(id)}-foreground border-calendar-${serviceColor(id)}-accent`);
    expect(serviceDotClass(id)).toBe(`bg-calendar-${serviceColor(id)}-accent`);
  });
  it("spreads services across the palette", () => {
    const colors = new Set(Array.from({ length: 64 }, (_, index) => serviceColor(`service-${index}`)));
    expect(colors.size).toBe(SERVICE_COLOR_COUNT);
  });
});

describe("calendar color tokens", () => {
  const theme = readFileSync(new URL("../../app/theme.css", import.meta.url), "utf8");
  const block = (selector: string) => theme.slice(theme.indexOf(`${selector} {`), theme.indexOf("}", theme.indexOf(`${selector} {`)));
  it.each([":root", ".dark"])("defines a fill, text and edge for every service color in %s", (selector) => {
    for (let color = 1; color <= SERVICE_COLOR_COUNT; color += 1) {
      for (const suffix of ["", "-foreground", "-accent"]) expect(block(selector)).toContain(`--calendar-${color}${suffix}:`);
    }
  });
  it("keeps text dark on light fills and light on dark fills", () => {
    const lightness = (selector: string, name: string) => Number(new RegExp(`--${name}: oklch\\(([\\d.]+)`).exec(block(selector))![1]);
    for (let color = 1; color <= SERVICE_COLOR_COUNT; color += 1) {
      expect(lightness(":root", `calendar-${color}`) - lightness(":root", `calendar-${color}-foreground`)).toBeGreaterThanOrEqual(0.55);
      expect(lightness(".dark", `calendar-${color}-foreground`) - lightness(".dark", `calendar-${color}`)).toBeGreaterThanOrEqual(0.55);
    }
  });
});
