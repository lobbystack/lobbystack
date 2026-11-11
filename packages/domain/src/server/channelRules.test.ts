import { describe, expect, it } from "vitest";

import { snapshotRules } from "../snapshot";
import { legacyInstructionsFrom } from "./channelRules";

describe("legacyInstructionsFrom", () => {
  it("reads each old field from its channel's first rule while it's on", () => {
    expect(legacyInstructionsFrom([
      { channel: null, content: "Every channel", active: true },
      { channel: "voice", content: "First call rule", active: true },
      { channel: "voice", content: "Second call rule", active: true },
      { channel: "sms", content: "Turned off", active: false },
      { channel: "instagram", content: "Instagram only", active: true },
    ])).toEqual({ voiceInstructions: "First call rule", smsInstructions: null, chatInstructions: null });
  });

  it("reads chat instructions from the website chat rule", () => {
    expect(legacyInstructionsFrom([{ channel: "web_chat", content: "Chat", active: true }]).chatInstructions).toBe("Chat");
  });
});

describe("snapshotRules", () => {
  it("keeps 8,000 characters of a rule kept to a channel and 4,000 of one for every channel", () => {
    const [all, voice] = snapshotRules([
      { id: "a", title: "All", content: "a".repeat(9_000), order: 1 },
      { id: "v", title: "Calls", content: "v".repeat(9_000), order: 2, channel: "voice" },
    ]);
    expect(all?.content).toHaveLength(4_000);
    expect(all).not.toHaveProperty("channel");
    expect(voice?.content).toHaveLength(8_000);
    expect(voice?.channel).toBe("voice");
  });
});
