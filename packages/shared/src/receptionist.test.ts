import { describe, expect, it, vi } from "vitest";

import { isContactPasscode, isGuessableContactPasscode, randomContactPasscode } from "./receptionist";

describe("isContactPasscode", () => {
  it("takes 4 to 8 digits", () => {
    expect(isContactPasscode("4806")).toBe(true);
    expect(isContactPasscode("48061397")).toBe(true);
  });

  it("refuses other lengths and anything but digits", () => {
    expect(isContactPasscode("480")).toBe(false);
    expect(isContactPasscode("480613971")).toBe(false);
    expect(isContactPasscode("48 06")).toBe(false);
    expect(isContactPasscode("4806#")).toBe(false);
    expect(isContactPasscode("٤٨٠٦")).toBe(false);
    expect(isContactPasscode("")).toBe(false);
  });
});

describe("isGuessableContactPasscode", () => {
  it("catches one digit repeated and digits in a row either way", () => {
    for (const passcode of ["0000", "77777777", "1234", "456789", "4321", "98765"]) expect(isGuessableContactPasscode(passcode)).toBe(true);
  });

  it("allows other PINs", () => {
    for (const passcode of ["2468", "1235", "0001", "480613", "9012", "1212"]) expect(isGuessableContactPasscode(passcode)).toBe(false);
  });
});

describe("randomContactPasscode", () => {
  it("makes six digits by default, or the length asked for, never a guessable one", () => {
    expect(randomContactPasscode()).toMatch(/^\d{6}$/);
    for (const length of [4, 5, 7, 8]) {
      for (let draw = 0; draw < 50; draw += 1) {
        const passcode = randomContactPasscode(length);
        expect(passcode).toHaveLength(length);
        expect(isContactPasscode(passcode) && !isGuessableContactPasscode(passcode), passcode).toBe(true);
      }
    }
  });

  it("skips half bytes above 9 and draws a guessable PIN again", () => {
    // Read as half bytes: A is skipped, 1 2 3 4 counts up so it's drawn again, then C and B are skipped.
    const draws = [[0xa1, 0x23, 0x4f, 0xff], [0x97, 0xc0, 0x5b, 0x88]];
    const random = vi.spyOn(crypto, "getRandomValues").mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
      (array as unknown as Uint8Array).set(draws.shift()!);
      return array;
    });
    try {
      expect(randomContactPasscode(4)).toBe("9705");
      expect(draws).toHaveLength(0);
    } finally {
      random.mockRestore();
    }
  });

  it("refuses a length a PIN can't have", () => {
    for (const length of [3, 9, 4.5]) expect(() => randomContactPasscode(length)).toThrow(RangeError);
  });
});
