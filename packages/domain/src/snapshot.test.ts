import { describe, expect, it } from "vitest";

import { buildBusinessContextSnapshot } from "./snapshot";

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
      phoneNumber: "+14165550000",
      smsNumber: "+14165550000",
    });

    expect(snapshot.knowledgeDigest).toBe("Parking is behind the building.");
    expect(snapshot.knowledgeSnippets?.map((snippet) => snippet.id)).toEqual([
      "snippet-2",
      "snippet-1",
    ]);
    expect(snapshot.rules?.map((rule) => rule.id)).toEqual(["rule-1", "rule-2"]);
    expect(snapshot.contactChannels.phoneNumber).toBe("+14165550000");
  });
});
