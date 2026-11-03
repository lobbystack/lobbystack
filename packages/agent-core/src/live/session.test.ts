import { demoSnapshot } from "@lobbystack/shared";
import { describe, expect, it } from "vitest";

import { buildBrowserSessionConfig, buildPhoneSessionConfig } from "./session";

describe("GPT-Live session config", () => {
  // The worker sends the greeting when the session starts. A second copy in
  // the starting history could make GPT-Live greet twice.
  it("starts phone and browser sessions without the greeting in their history", () => {
    expect(buildPhoneSessionConfig(demoSnapshot).input).toBeUndefined();
    expect(buildBrowserSessionConfig(demoSnapshot).input).toBeUndefined();
  });

  it("speaks in the voice the business picked, on the phone and in the browser", () => {
    const snapshot = { ...demoSnapshot, voice: "cedar" as const };
    expect(buildPhoneSessionConfig(snapshot).audio?.output?.voice).toBe("cedar");
    expect(buildBrowserSessionConfig(snapshot).audio?.output?.voice).toBe("cedar");
  });

  // Snapshots built before businesses could pick a voice have none.
  it("falls back to marin for a snapshot with no voice or one GPT-Live doesn't have", () => {
    const { voice: _voice, ...withoutVoice } = demoSnapshot;
    const retired = { ...demoSnapshot, voice: "nova" } as unknown as typeof demoSnapshot;
    for (const snapshot of [withoutVoice, retired]) {
      expect(buildPhoneSessionConfig(snapshot).audio?.output?.voice).toBe("marin");
      expect(buildBrowserSessionConfig(snapshot).audio?.output?.voice).toBe("marin");
    }
  });

  it("leaves the history empty for a business with no greeting", () => {
    expect(buildPhoneSessionConfig({ ...demoSnapshot, greeting: " " })).not.toHaveProperty("input");
  });

  // Only a phone call can be transferred, so a browser call gives the number to call instead.
  it("tells GPT-Live whether it's on a phone call or a browser call", () => {
    const browser = buildBrowserSessionConfig(demoSnapshot).instructions;
    const phone = buildPhoneSessionConfig(demoSnapshot).instructions;
    expect(browser).toContain("This call is in the caller's web browser, not on a phone line, so it can't be transferred");
    expect(browser).not.toContain("- Transfers:");
    expect(phone).toContain("- Transfers: connect the caller to a person when the business allows it.");
    expect(phone).not.toContain("web browser");
  });
});
