import { describe, expect, it } from "vitest";

import { employeeHours, employeeServiceIds, employeeTimeOff, optionalEmployeePhone } from "./employee-phone";

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

describe("employeeHours", () => {
  it("reads a list of windows, treats a missing one as the business's hours, and rejects anything else", () => {
    expect(employeeHours([{ dayOfWeek: 1, openMinutes: 540, closeMinutes: 1020, extra: 1 }])).toEqual([{ dayOfWeek: 1, openMinutes: 540, closeMinutes: 1020 }]);
    for (const value of [undefined, null]) expect(employeeHours(value)).toBeNull();
    expect(employeeHours([])).toEqual([]);
    for (const value of ["9-17", [{ dayOfWeek: 1, openMinutes: "9:00", closeMinutes: 1020 }], [null]]) expect(employeeHours(value)).toBeUndefined();
  });
});

describe("employeeTimeOff", () => {
  it("reads a list of first and last days, treats a missing one as none, and rejects anything else", () => {
    expect(employeeTimeOff([{ startsOn: "2026-10-20", endsOn: "2026-10-24", extra: 1 }])).toEqual([{ startsOn: "2026-10-20", endsOn: "2026-10-24" }]);
    for (const value of [undefined, null]) expect(employeeTimeOff(value)).toEqual([]);
    for (const value of ["2026-10-20", [{ startsOn: "2026-10-20" }], [{ startsOn: 1, endsOn: 2 }], [null]]) expect(employeeTimeOff(value)).toBeUndefined();
  });
});
