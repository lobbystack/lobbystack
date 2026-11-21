import { describe, expect, it } from "vitest";

import { isTollFreeDirection, zadarmaE164, zadarmaFlag } from "./zadarmaDirections";

describe("Zadarma destinations", () => {
  it("reads booleans in every form Zadarma writes them", () => {
    expect([true, "true", 1, "1"].every(zadarmaFlag)).toBe(true);
    expect([false, "false", 0, "0", null, undefined, ""].some(zadarmaFlag)).toBe(false);
  });

  it("finds toll-free destinations by name or area code, and no landline one", () => {
    expect(isTollFreeDirection({ name: "Toll-free", areaCode: "800" })).toBe(true);
    expect(isTollFreeDirection({ name: "Toll Free" })).toBe(true);
    expect(isTollFreeDirection({ areaCode: 800 })).toBe(true);
    for (const [name, areaCode] of [["Belgrade", "11"], ["Novi Sad", "21"], ["Zajecar", "19"]] as const) expect(isTollFreeDirection({ name, areaCode })).toBe(false);
  });

  it("writes a listed number as E.164, whether Zadarma lists it nationally or with the country code", () => {
    expect(zadarmaE164("0800800862", { countryCode: "381" })).toBe("+381800800862");
    expect(zadarmaE164("381213860081", { countryCode: "381" })).toBe("+381213860081");
    expect(zadarmaE164("+381 21 386 0081", {})).toBe("+381213860081");
  });
});
