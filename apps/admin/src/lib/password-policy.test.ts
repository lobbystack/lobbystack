import { describe, expect, it } from "vitest";
import { failedPasswordRequirements, meetsPasswordRequirements } from "./password-policy";

describe("original password requirements", () => {
  it.each(["short1!", "longpassword!", "longpassword1", "password1 "])("rejects a password missing a required part", password => {
    expect(meetsPasswordRequirements(password)).toBe(false);
  });
  it("accepts a password with eight characters, a number and a special character", () => {
    expect(meetsPasswordRequirements("abcdef1!")).toBe(true);
  });
});

describe("failedPasswordRequirements", () => {
  it("lists each requirement the password misses, in order", () => {
    expect(failedPasswordRequirements("abc")).toEqual(["minimumLength", "number", "specialCharacter"]);
    expect(failedPasswordRequirements("longpassword!")).toEqual(["number"]);
    expect(failedPasswordRequirements("abcdef1!")).toEqual([]);
  });
});
