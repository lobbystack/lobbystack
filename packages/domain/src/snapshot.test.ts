import { describe, expect, it } from "vitest";

import {
  buildBusinessContextSnapshot,
  MAX_AGENT_RULE_CONTENT_CHARS,
  MAX_AGENT_RULE_TITLE_CHARS,
  MAX_AGENT_RULES_PER_SNAPSHOT,
  snapshotRules,
} from "./snapshot";

describe("buildBusinessContextSnapshot", () => {
  it("includes the knowledge digest, prioritized snippets, and contact channels", () => {
    const snapshot = buildBusinessContextSnapshot({
      businessId: "biz-1",
      version: "v1",
      generatedAt: "2026-03-08T12:00:00.000Z",
      displayName: "Maple Family Clinic",
      timezone: "America/Toronto",
      defaultLocale: "en",
      businessType: "clinic",
      greeting: "Hello",
      tone: "warm",
      bookingPolicy: "Only confirm after booking.",
      summary: "General clinic",
      knowledgeDigest: "Parking is behind the building.",
      hours: [{ dayOfWeek: 1, openMinutes: 540, closeMinutes: 1020 }],
      closures: [],
      services: [{ id: "svc-1", name: "Checkup", durationMinutes: 30 }],
      rules: [
        { id: "rule-2", title: "Second", content: "Ask for call volume.", order: 2000 },
        { id: "rule-1", title: "First", content: "Ask business type.", order: 1000 },
      ],
      snippets: [
        { id: "snippet-1", title: "Parking", content: "Rear lot", tags: [], priority: 2 },
        { id: "snippet-2", title: "Masks", content: "Optional", tags: [], priority: 10 },
      ],
      transferPolicy: { mode: "on_urgent", transferNumber: "+14165551234" },
      appointmentChangePolicy: { enabled: true, allowCancel: false, allowReschedule: true, verificationMode: "otp_required" },
      phoneNumber: "+14165550000",
      smsNumber: "+14165550000",
      chatInstructions: "Be concise in the chat widget.",
    });

    expect(snapshot.transferPolicy.mode).toBe("on_urgent");
    expect(snapshot.appointmentChangePolicy).toEqual({ enabled: true, allowCancel: false, allowReschedule: true, verificationMode: "otp_required" });
    expect(snapshot.knowledgeDigest).toBe("Parking is behind the building.");
    expect(snapshot.chatInstructions).toBe("Be concise in the chat widget.");
    expect(snapshot.knowledgeSnippets?.map((snippet) => snippet.id)).toEqual([
      "snippet-2",
      "snippet-1",
    ]);
    expect(snapshot.rules?.map((rule) => rule.id)).toEqual(["rule-1", "rule-2"]);
    expect(snapshot.contactChannels.phoneNumber).toBe("+14165550000");
  });

  it("caps rule count and text stored in snapshots", () => {
    const snapshot = buildBusinessContextSnapshot({
      businessId: "biz-1",
      version: "v1",
      generatedAt: "2026-03-08T12:00:00.000Z",
      displayName: "Maple Family Clinic",
      timezone: "America/Toronto",
      defaultLocale: "en",
      businessType: "clinic",
      greeting: "Hello",
      tone: "warm",
      bookingPolicy: "Only confirm after booking.",
      summary: "General clinic",
      hours: [],
      closures: [],
      services: [],
      rules: Array.from({ length: MAX_AGENT_RULES_PER_SNAPSHOT + 1 }, (_, index) => ({
        id: `rule-${index}`,
        title: `${index} ${"T".repeat(MAX_AGENT_RULE_TITLE_CHARS + 20)}`,
        content: `${index} ${"C".repeat(MAX_AGENT_RULE_CONTENT_CHARS + 20)}`,
        order: index,
      })),
      snippets: [],
      transferPolicy: { mode: "never" },
    });

    expect(snapshot.rules).toHaveLength(MAX_AGENT_RULES_PER_SNAPSHOT);
    expect(snapshot.rules?.at(-1)?.id).toBe(`rule-${MAX_AGENT_RULES_PER_SNAPSHOT - 1}`);
    expect(snapshot.rules?.every((rule) => rule.title.length <= MAX_AGENT_RULE_TITLE_CHARS)).toBe(
      true,
    );
    expect(
      snapshot.rules?.every((rule) => rule.content.length <= MAX_AGENT_RULE_CONTENT_CHARS),
    ).toBe(true);
  });

  it("keeps an agent's channel rules, its old instructions among them, past the rules for every channel", () => {
    // 0203 appended converted instructions after an agent's other rules.
    const everyChannel = Array.from({ length: MAX_AGENT_RULES_PER_SNAPSHOT + 5 }, (_, index) => ({ id: `rule-${index}`, title: `Rule ${index}`, content: "Be kind.", order: index }));
    const channelRules = (["voice", "sms", "web_chat"] as const).map((channel, index) => ({ id: channel, title: channel, content: "Converted.", order: everyChannel.length + index, channel }));
    const extraCalls = Array.from({ length: MAX_AGENT_RULES_PER_SNAPSHOT }, (_, index) => ({ id: `call-${index}`, title: `Call ${index}`, content: "On calls.", order: 1000 + index, channel: "voice" as const }));
    const rules = snapshotRules([...extraCalls, ...channelRules, ...everyChannel].reverse());
    expect(rules.filter((rule) => !rule.channel)).toHaveLength(MAX_AGENT_RULES_PER_SNAPSHOT);
    expect(rules.filter((rule) => rule.channel === "voice").map((rule) => rule.id)).toEqual(["voice", ...extraCalls.slice(0, MAX_AGENT_RULES_PER_SNAPSHOT - 1).map((rule) => rule.id)]);
    expect(rules.filter((rule) => rule.channel && rule.channel !== "voice").map((rule) => rule.id)).toEqual(["sms", "web_chat"]);
    // Still in the order the agent reads them.
    expect(rules.map((rule) => rule.order)).toEqual(rules.map((rule) => rule.order).sort((left, right) => left - right));
  });
});
