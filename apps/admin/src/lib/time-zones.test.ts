import { describe, expect, it } from "vitest";

import { availableTimeZones, groupTimeZones, timeZoneOffset } from "./time-zones";

// A summer date, so the offsets below are the daylight-saving ones.
const july = new Date("2026-07-01T12:00:00Z");

describe("time zones", () => {
  it("offers zones on every continent", () => {
    const zones = availableTimeZones("America/Toronto");
    for (const zone of ["America/Vancouver", "Europe/Belgrade", "Asia/Tokyo", "Africa/Lagos", "Australia/Sydney", "Pacific/Auckland"]) expect(zones).toContain(zone);
  });

  it("keeps a business zone the browser doesn't list, and offers UTC", () => {
    expect(availableTimeZones("US/Eastern")).toContain("US/Eastern");
    expect(availableTimeZones("America/Toronto").filter((zone) => zone === "America/Toronto")).toHaveLength(1);
    expect(availableTimeZones("America/Toronto").filter((zone) => zone === "UTC")).toHaveLength(1);
    expect(availableTimeZones("UTC").filter((zone) => zone === "UTC")).toHaveLength(1);
  });

  it("formats the offset in the dashboard language", () => {
    expect(timeZoneOffset("America/Vancouver", "en", july)).toBe("GMT-07:00");
    expect(timeZoneOffset("Asia/Kolkata", "en", july)).toBe("GMT+05:30");
    expect(timeZoneOffset("Not/AZone", "en", july)).toBe("");
  });

  it("groups zones by region, regionless zones first, with city labels and offsets", () => {
    const groups = groupTimeZones(["Europe/Paris", "UTC", "America/Vancouver", "America/Argentina/Buenos_Aires", "Asia/Tokyo", "America/Los_Angeles"], "en", july);
    expect(groups.map((group) => group.region)).toEqual([null, "America", "Asia", "Europe"]);
    // ICU versions write UTC's offset as GMT or GMT+00:00.
    expect(groups[0]!.zones).toEqual([{ id: "UTC", label: expect.stringMatching(/^UTC \(GMT(\+00:00)?\)$/) }]);
    expect(groups[1]!.zones).toEqual([
      { id: "America/Argentina/Buenos_Aires", label: "Argentina / Buenos Aires (GMT-03:00)" },
      { id: "America/Los_Angeles", label: "Los Angeles (GMT-07:00)" },
      { id: "America/Vancouver", label: "Vancouver (GMT-07:00)" },
    ]);
  });

  it("puts regions IANA doesn't define after the known ones", () => {
    expect(groupTimeZones(["Etc/GMT+5", "Pacific/Fiji", "Africa/Lagos"], "en", july).map((group) => group.region)).toEqual(["Africa", "Pacific", "Etc"]);
  });
});
