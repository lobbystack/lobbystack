import { describe, expect, it } from "vitest";

import { optionalEmployeePhone } from "./employee-phone";

describe("optionalEmployeePhone", () => {
  it("treats a missing or blank phone as no phone", () => {
    for (const value of [undefined, null, "", "   "]) expect(optionalEmployeePhone(value)).toBeNull();
  });

  it("normalizes a valid number and rejects anything else", () => {
    expect(optionalEmployeePhone("+1 415 555 0100")).toBe("+14155550100");
    expect(optionalEmployeePhone("123")).toBeUndefined();
    expect(optionalEmployeePhone(42)).toBeUndefined();
  });
});
