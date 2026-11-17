import { describe, expect, it } from "vitest";

import { matchesSearch } from "./search-match";

describe("matchesSearch", () => {
  it("matches everything when the query is empty", () => {
    expect(matchesSearch("  ", ["Anything"])).toBe(true);
  });

  it("ignores accents and case, so cafe finds Café", () => {
    expect(matchesSearch("cafe", ["Café Olé"])).toBe(true);
    expect(matchesSearch("CAFÉ", ["cafe"])).toBe(true);
  });

  it("needs every word, in any field and any order", () => {
    expect(matchesSearch("sam cut", ["Milan", "Cut", "Sam"])).toBe(true);
    expect(matchesSearch("sam color", ["Milan", "Cut", "Sam"])).toBe(false);
  });

  it("finds a phone number however it is typed", () => {
    const fields = ["Milan", "+14165550100"];
    expect(matchesSearch("416 555", fields)).toBe(true);
    expect(matchesSearch("(416) 555-0100", fields)).toBe(true);
    expect(matchesSearch("+1 416 555 0100", fields)).toBe(true);
    expect(matchesSearch("416 556", fields)).toBe(false);
  });

  it("doesn't join the digits of two fields into a number", () => {
    expect(matchesSearch("0100 2026", ["+14165550100", "2026-09-02"])).toBe(true);
    expect(matchesSearch("01002026", ["+14165550100", "2026-09-02"])).toBe(false);
  });
});
