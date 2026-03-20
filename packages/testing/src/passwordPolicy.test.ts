import { describe, expect, it } from "vitest";

import { validatePasswordRequirements } from "../../../convex/lib/passwordPolicy";

describe("validatePasswordRequirements", () => {
  it("rejects passwords shorter than twelve characters", () => {
    expect(() => validatePasswordRequirements("short123")).toThrow("Invalid password");
  });

  it("rejects common weak passwords even when they meet the length floor", () => {
    expect(() => validatePasswordRequirements("password123")).toThrow("Invalid password");
  });

  it("accepts longer passphrases", () => {
    expect(() => validatePasswordRequirements("maple clinic sunrise")).not.toThrow();
  });
});
