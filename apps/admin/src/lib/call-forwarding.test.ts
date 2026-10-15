import { describe, expect, it } from "vitest";

import { carrierGroups, dialCode } from "./call-forwarding";

describe("call forwarding", () => {
  it("fills a carrier code with the number in the form the carrier expects", () => {
    expect(dialCode("*71{number}", "+15818927672", "national")).toBe("*715818927672");
    expect(dialCode("**004*{number}#", "+15818927672", "1prefix")).toBe("**004*15818927672#");
    expect(dialCode("**21*{number}#", "+15818927672", "plus")).toBe("**21*+15818927672#");
  });

  it("lists each carrier once, with codes and paths it can show", () => {
    const carriers = carrierGroups.flatMap((group) => group.items);
    expect(carriers.length).toBeGreaterThan(20);
    expect(new Set(carriers.map((carrier) => carrier.id)).size).toBe(carriers.length);
    for (const carrier of carriers) {
      for (const how of [carrier.missed, carrier.all]) {
        if (how?.method === "code") expect(how.on).toMatch(/^[*#]/);
        if (how?.method === "settings") expect(how.path.length).toBeGreaterThan(0);
      }
    }
  });
});
