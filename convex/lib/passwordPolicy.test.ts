import { describe, expect, it } from "vitest";

import { validatePasswordRequirements } from "./passwordPolicy";

describe("validatePasswordRequirements", () => {
  it("rejects passwords shorter than eight characters", () => {
    expect(() => validatePasswordRequirements("abc1!de")).toThrow("Invalid password");
  });

  it("rejects passwords without a number", () => {
    expect(() => validatePasswordRequirements("abcdefgh!")).toThrow("Invalid password");
  });

  it("rejects passwords without a special character", () => {
    expect(() => validatePasswordRequirements("abcdefg1")).toThrow("Invalid password");
  });

  it("accepts passwords with eight characters, a number, and a special character", () => {
    expect(() => validatePasswordRequirements("maple1!s")).not.toThrow();
  });
});
