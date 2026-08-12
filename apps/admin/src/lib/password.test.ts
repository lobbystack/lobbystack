import { describe, expect, it } from "vitest";

import { hashReplacementPassword, isLegacyScryptHash, verifyLegacyPassword } from "./password";

describe("replacement password compatibility", () => {
  it("verifies Lucia Scrypt hashes and rejects incorrect passwords", async () => {
    const hash = await hashReplacementPassword("Correct Horse Battery Staple!");

    await expect(verifyLegacyPassword(hash, "Correct Horse Battery Staple!")).resolves.toBe(true);
    await expect(verifyLegacyPassword(hash, "wrong-password")).resolves.toBe(false);
    expect(isLegacyScryptHash(hash)).toBe(false);
  });

  it("recognizes untagged Lucia hashes as legacy", async () => {
    const { Scrypt } = await import("lucia");
    const hash = await new Scrypt().hash("Correct Horse Battery Staple!");

    expect(isLegacyScryptHash(hash)).toBe(true);
    await expect(verifyLegacyPassword(hash, "Correct Horse Battery Staple!")).resolves.toBe(true);
  });
});
