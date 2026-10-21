import { describe, expect, it, vi } from "vitest";

const hashing = vi.hoisted(() => ({ running: 0, most: 0 }));
vi.mock("node:crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:crypto")>()),
  // Echoes its input as the key, a few milliseconds later, so overlapping hashes can be counted.
  scrypt: (password: string, _salt: string, _length: number, _options: unknown, callback: (error: Error | null, key: Buffer) => void) => {
    hashing.running += 1;
    hashing.most = Math.max(hashing.most, hashing.running);
    setTimeout(() => {
      hashing.running -= 1;
      callback(null, Buffer.from(password));
    }, 5);
  },
}));

import { ContactPasscodeHashesBusyError, hashContactPasscodes } from "./contactPasscodes";

describe("hashContactPasscodes", () => {
  it("returns hashes in order, running at most two at once however many bulk changes run together", async () => {
    const entries = (prefix: string) => Array.from({ length: 5 }, (_, index) => ({ contactId: `${prefix}-${index}`, passcode: `48061${index}` }));
    const results = await Promise.all(["a", "b", "c"].map(async (prefix) => [prefix, await hashContactPasscodes(entries(prefix))] as const));
    expect(hashing.most).toBe(2);
    expect(hashing.running).toBe(0);
    for (const [prefix, hashes] of results) {
      expect(hashes).toHaveLength(5);
      hashes.forEach((hash, index) => {
        const [scheme, salt, key] = hash.split(":");
        expect(scheme).toBe("scrypt-v1");
        expect(salt).toMatch(/^[0-9a-f]{32}$/);
        expect(Buffer.from(key!, "hex").toString()).toMatch(new RegExp(`:contact-passcode:${prefix}-${index}:48061${index}$`));
      });
    }
    // The slots free up again for the next change.
    expect(await hashContactPasscodes([])).toEqual([]);
    expect(await hashContactPasscodes(entries("d").slice(0, 1))).toHaveLength(1);
  });

  it("refuses a caller whose PINs waiting for a hash would pass its limit, before hashing any, and lets other callers through", async () => {
    const entries = (prefix: string, length: number) => Array.from({ length }, (_, index) => ({ contactId: `${prefix}-${index}`, passcode: `48062${index % 10}` }));
    const first = hashContactPasscodes(entries("key-a", 4), { caller: "key-a", callerLimit: 5 });
    // key-a has 4 waiting, so 2 more would make 6.
    await expect(hashContactPasscodes(entries("key-a2", 2), { caller: "key-a", callerLimit: 5 })).rejects.toBeInstanceOf(ContactPasscodeHashesBusyError);
    // Another caller is unaffected, and key-a can still fit one more.
    const other = hashContactPasscodes(entries("key-b", 5), { caller: "key-b", callerLimit: 5 });
    const fits = hashContactPasscodes(entries("key-a3", 1), { caller: "key-a", callerLimit: 5 });
    expect((await Promise.all([first, other, fits])).map((hashes) => hashes.length)).toEqual([4, 5, 1]);
    // Once its hashes finish, key-a can send a full batch again.
    expect(await hashContactPasscodes(entries("key-a4", 5), { caller: "key-a", callerLimit: 5 })).toHaveLength(5);
  });
});
