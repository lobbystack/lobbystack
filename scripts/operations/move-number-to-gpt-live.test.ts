import { describe, expect, it, vi } from "vitest";

vi.mock("@lobbystack/db", () => ({ createDatabaseClient: vi.fn(), phoneNumbers: {}, withBusinessTransaction: vi.fn() }));
vi.mock("@lobbystack/providers/twilio/twilioProvider", () => ({ TwilioProvider: vi.fn() }));

import { rollbackVoiceUrl } from "./move-number-to-gpt-live";

describe("rollbackVoiceUrl", () => {
  it("points the number at the gateway's inbound route", () => {
    expect(rollbackVoiceUrl("https://voice.lobbystack.com/")).toBe("https://voice.lobbystack.com/twilio/voice/inbound");
  });

  it("refuses to roll back without an HTTPS gateway URL", () => {
    expect(() => rollbackVoiceUrl(undefined)).toThrow("VOICE_GATEWAY_BASE_URL");
    expect(() => rollbackVoiceUrl("")).toThrow("VOICE_GATEWAY_BASE_URL");
    expect(() => rollbackVoiceUrl("http://voice.example.com")).toThrow("VOICE_GATEWAY_BASE_URL");
  });
});
