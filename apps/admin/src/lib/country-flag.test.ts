import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { runtimeLocales } from "@lobbystack/shared";
import { describe, expect, it } from "vitest";

import { currencyRegion, runtimeLocaleRegion } from "./country-flag";

const flagStylesheet = readFileSync(createRequire(import.meta.url).resolve("country-flag-icons/3x2/flags.css"), "utf8");
const hasFlag = (region: string) => flagStylesheet.includes(`.flag\\:${region}{`);

describe("country flags", () => {
  it("gives every caller language a flag the stylesheet has", () => {
    expect(runtimeLocales.map(runtimeLocaleRegion)).toEqual(["GB", "FR", "ES", "RS", "DE", "BR", "IT", "NL"]);
    for (const locale of runtimeLocales) expect(hasFlag(runtimeLocaleRegion(locale))).toBe(true);
  });

  it("takes a currency's region from its code and leaves shared currencies without one", () => {
    expect(currencyRegion("USD")).toBe("US");
    expect(currencyRegion("XAF")).toBeNull();
    expect(currencyRegion("ANG")).toBeNull();
  });

  it("has a flag for the currencies the agent page offers", () => {
    for (const code of ["USD", "EUR", "GBP", "CAD", "AUD", "NZD", "RSD", "CHF", "JPY", "BRL"]) {
      const region = currencyRegion(code);
      expect(region && hasFlag(region), code).toBe(true);
    }
  });
});
