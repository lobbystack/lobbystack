import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret, secretBoxKeyFromEnvironment } from "./secretBox";

describe("secretBox", () => {
  it("round trips encrypted calendar credentials", () => {
    const key = Buffer.alloc(32, 7);
    const encrypted = encryptSecret("refresh-token", key);
    expect(encrypted).not.toContain("refresh-token");
    expect(decryptSecret(encrypted, key)).toBe("refresh-token");
  });

  it("accepts hex and base64 environment keys", () => {
    expect(secretBoxKeyFromEnvironment({ CALENDAR_TOKEN_ENCRYPTION_KEY: "00".repeat(32) })).toHaveLength(32);
    expect(secretBoxKeyFromEnvironment({ CALENDAR_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64") })).toHaveLength(32);
  });
});
