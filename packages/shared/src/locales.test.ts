import { describe, expect, it } from "vitest";

import { interfaceLocaleTags, interfaceLocales, intlLocale, normalizeInterfaceLocale } from "./locales";

const CYRILLIC = /[Ѐ-ӿ]/;
const sample = new Date(Date.UTC(2026, 8, 30, 12));

describe("intlLocale", () => {
  it("maps Serbian to Latin script and leaves other tags alone", () => {
    expect(intlLocale("sr")).toBe("sr-Latn");
    expect(intlLocale("sr-RS")).toBe("sr-Latn-RS");
    expect(intlLocale("sr_Cyrl_RS")).toBe("sr-Latn-RS");
    expect(intlLocale("sr-Latn")).toBe("sr-Latn");
    expect(intlLocale("es")).toBe("es");
    expect(intlLocale("fr-CA")).toBe("fr-CA");
    expect(intlLocale(undefined)).toBe("en");
    expect(interfaceLocaleTags.sr).toBe("sr-Latn");
  });

  it("formats Serbian dates and numbers in Latin script", () => {
    const date = new Intl.DateTimeFormat(intlLocale("sr"), { dateStyle: "full", timeZone: "UTC" }).format(sample);
    const money = new Intl.NumberFormat(intlLocale("sr"), { style: "currency", currency: "USD" }).format(1234.5);
    const relative = new Intl.RelativeTimeFormat(intlLocale("sr")).format(-2, "day");

    expect(date).toContain("septembar");
    expect(date).not.toMatch(CYRILLIC);
    expect(money.replace(/\s/g, " ")).toBe("1.234,50 US$");
    expect(relative).toBe("pre 2 dana");
    // A bare `sr` tag would have produced Cyrillic output.
    expect(new Intl.DateTimeFormat("sr", { month: "long", timeZone: "UTC" }).format(sample)).toMatch(CYRILLIC);
  });

  it("keeps every interface locale tag usable by Intl", () => {
    for (const locale of interfaceLocales) {
      expect(Intl.DateTimeFormat.supportedLocalesOf(interfaceLocaleTags[locale])).toHaveLength(1);
    }
  });
});

describe("normalizeInterfaceLocale", () => {
  it("reduces language tags to supported short codes", () => {
    expect(normalizeInterfaceLocale("es-MX")).toBe("es");
    expect(normalizeInterfaceLocale("sr-Latn-RS")).toBe("sr");
    expect(normalizeInterfaceLocale("FR")).toBe("fr");
    expect(normalizeInterfaceLocale("de")).toBeNull();
    expect(normalizeInterfaceLocale("")).toBeNull();
  });
});
