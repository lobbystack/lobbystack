import { describe, expect, it } from "vitest";

import { hashReplacementPassword, isLegacyScryptHash, verifyLegacyPassword } from "./password";

// Made by lucia 3.2.2 `new Scrypt().hash("Correct Horse Battery Staple!")`, the format of stored legacy hashes.
const luciaHash = "5b569176159fdc981169db51ce84b7df:b7df9bad6067ed0cf84ed6549e9889675daf2a897547af00cd4f6bfce31bd0121505ab9a8e470bec7dfac1e22d7ea18100c84567f80ff9c8a47a27f371a80ce4";

describe("replacement password compatibility", () => {
  it("verifies replacement hashes and rejects incorrect passwords", async () => {
    const hash = await hashReplacementPassword("Correct Horse Battery Staple!");

    await expect(verifyLegacyPassword(hash, "Correct Horse Battery Staple!")).resolves.toBe(true);
    await expect(verifyLegacyPassword(hash, "wrong-password")).resolves.toBe(false);
    expect(isLegacyScryptHash(hash)).toBe(false);
  });

  it("verifies untagged Lucia hashes as legacy", async () => {
    expect(isLegacyScryptHash(luciaHash)).toBe(true);
    await expect(verifyLegacyPassword(luciaHash, "Correct Horse Battery Staple!")).resolves.toBe(true);
    await expect(verifyLegacyPassword(luciaHash, "wrong-password")).resolves.toBe(false);
    await expect(verifyLegacyPassword(luciaHash.slice(0, -2), "Correct Horse Battery Staple!")).resolves.toBe(false);
  });
});
