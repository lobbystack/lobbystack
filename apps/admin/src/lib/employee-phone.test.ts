import { describe, expect, it } from "vitest";

import { employeeServiceIds, employeeVacation, optionalEmployeePhone } from "./employee-phone";

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

describe("employeeServiceIds", () => {
  it("accepts a non-empty list of IDs and rejects anything else", () => {
    expect(employeeServiceIds(["a", "b"])).toEqual(["a", "b"]);
    for (const value of [undefined, null, [], "a", [1], ["a", null]]) expect(employeeServiceIds(value)).toBeNull();
  });
});

describe("employeeVacation", () => {
  it("reads a pair of days, treats a missing one as none, and rejects anything else", () => {
    expect(employeeVacation({ startsOn: "2026-10-20", endsOn: "2026-10-24", extra: 1 })).toEqual({ startsOn: "2026-10-20", endsOn: "2026-10-24" });
    for (const value of [undefined, null]) expect(employeeVacation(value)).toBeNull();
    for (const value of ["2026-10-20", { startsOn: "2026-10-20" }, { startsOn: 1, endsOn: 2 }]) expect(employeeVacation(value)).toBeUndefined();
  });
});
