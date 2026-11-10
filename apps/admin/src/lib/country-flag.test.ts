import { createRequire } from "node:module";

import { runtimeLocales } from "@lobbystack/shared";
import { describe, expect, it } from "vitest";

import { hasFlagComponent } from "./country-flag-components";
import { currencyRegion, runtimeLocaleRegion } from "./country-flag";

const require = createRequire(import.meta.url);
// The loader map and the package must both know the flag, or the page shows a globe for a country.
const hasFlag = (region: string) => {
  if (!hasFlagComponent(region)) return false;
  try {
    require.resolve(`country-flag-icons/react/3x2/${region}`);
    return true;
  } catch {
    return false;
  }
};

describe("country flags", () => {
  it("gives every caller language a flag the package has", () => {
    expect(runtimeLocales.map(runtimeLocaleRegion)).toEqual(["GB", "FR", "ES", "RS", "DE", "BR", "IT", "NL", "PL", "TR", "VN", "PH", "SE", "RU", "UA"]);
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
