import { describe, expect, it } from "vitest";

import { buildLiveCallUpdateTwiml } from "./transferCall";

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
