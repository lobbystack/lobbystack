import { afterEach, describe, expect, it, vi } from "vitest";

import { buildLiveCallUpdateTwiml, transferLiveCall } from "./transferCall";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("rejects an unapproved rehearsal transfer before any provider request", async () => {
  vi.stubEnv("LOBBYSTACK_CERTIFICATION_MODE", "true");
  vi.stubEnv("LOBBYSTACK_CERTIFICATION_PHONES", "+14165550123");
  const request = vi.spyOn(globalThis, "fetch");
  await expect(transferLiveCall({ callSid: "fixture", destination: "+14165550999" })).rejects.toThrow("CERTIFICATION_RECIPIENT_BLOCKED");
  expect(request).not.toHaveBeenCalled();
});

describe("buildLiveCallUpdateTwiml", () => {
  it("builds transfer TwiML with optional preface and action URL", () => {
    expect(
      buildLiveCallUpdateTwiml({
        sayMessage: "Please hold while I transfer you.",
        destination: "+15145550123",
        actionUrl: "https://voice.example.com/twilio/voice/transfer-action?callId=abc",
      }),
    ).toBe(
      '<Response><Say>Please hold while I transfer you.</Say><Dial action="https://voice.example.com/twilio/voice/transfer-action?callId=abc" method="POST">+15145550123</Dial></Response>',
    );
  });

  it("builds a simple speak-and-hangup fallback", () => {
    expect(
      buildLiveCallUpdateTwiml({
        sayMessage: "We are sorry, please call back later.",
        hangup: true,
      }),
    ).toBe(
      "<Response><Say>We are sorry, please call back later.</Say><Hangup /></Response>",
    );
  });

  it("builds a silent hangup", () => {
    expect(
      buildLiveCallUpdateTwiml({
        hangup: true,
      }),
    ).toBe("<Response><Hangup /></Response>");
  });
});
