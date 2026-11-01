import { describe, expect, it } from "vitest";

import { carrierGroups, carrierGroupsFor, dialCode, forwardingCountry } from "./call-forwarding";

describe("call forwarding", () => {
  it("fills a carrier code with the number in the form the carrier expects", () => {
    expect(dialCode("*71{number}", "+15818927672", "national")).toBe("*715818927672");
    expect(dialCode("**004*{number}#", "+15818927672", "1prefix")).toBe("**004*15818927672#");
    expect(dialCode("**21*{number}#", "+15818927672", "plus")).toBe("**21*+15818927672#");
    expect(dialCode("**61*{number}#", "+447700900123", "e164")).toBe("**61*+447700900123#");
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

  it("lists a country's own carriers", () => {
    const ids = (country: string | null) => carrierGroupsFor(country).flatMap((group) => group.items.map((carrier) => carrier.id));
    expect(ids("CA")).toContain("rogers");
    expect(ids("CA")).toContain("bell-home");
    expect(ids("CA")).not.toContain("verizon");
    expect(ids("CA")).not.toContain("landline-us");
    expect(ids("US")).toContain("verizon");
    expect(ids("US")).toContain("ringcentral");
    expect(ids("US")).not.toContain("rogers");
    expect(ids("US")).not.toContain("bell-home");
    expect(ids("GB")).toEqual(["vodafone-uk"]);
    expect(ids(null)).toEqual(expect.arrayContaining(["verizon", "rogers"]));
  });

  it("has no carriers where it holds no sourced steps", () => {
    expect(carrierGroupsFor("AU")).toEqual([]);
    expect(carrierGroupsFor("NZ")).toEqual([]);
    expect(carrierGroupsFor("unknown")).toEqual([]);
  });

  it("reads the country from a number outside +1, and from the business inside it", () => {
    const infer = () => "GB";
    expect(forwardingCountry("+447700900123", "US", infer)).toBe("GB");
    expect(forwardingCountry("+447700900123", "GB", () => undefined)).toBe("GB");
    expect(forwardingCountry("+447700900123", null, () => undefined)).toBe("unknown");
    expect(forwardingCountry("+15145550100", "CA", infer)).toBe("CA");
    expect(forwardingCountry("+15145550100", "GB", infer)).toBeNull();
    expect(forwardingCountry("+15145550100", null, infer)).toBeNull();
  });
});
