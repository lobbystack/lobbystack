import { runtimeLocales } from "@lobbystack/shared";
import { describe, expect, it } from "vitest";

import { countryFlag, currencyFlag, runtimeLocaleFlag } from "./country-flag";

describe("country flags", () => {
  it("builds the flag from a region code", () => {
    expect(countryFlag("rs")).toBe("🇷🇸");
  });

  it("gives every caller language a flag", () => {
    expect(runtimeLocales.map(runtimeLocaleFlag)).toEqual(["🇬🇧", "🇫🇷", "🇪🇸", "🇷🇸", "🇩🇪", "🇧🇷", "🇮🇹", "🇳🇱"]);
    for (const locale of runtimeLocales) expect(runtimeLocaleFlag(locale)).toMatch(/^\p{Regional_Indicator}{2}$/u);
  });

  it("uses a globe for currencies that no single country issues", () => {
    expect(currencyFlag("USD")).toBe("🇺🇸");
    expect(currencyFlag("XAF")).toBe("🌐");
  });
});
