import { describe, expect, it } from "vitest";

import { demoSnapshot, snapshotForReceptionist, type BusinessContextSnapshot, type ReceptionistSnapshot } from "./index";

function receptionist(overrides: Partial<ReceptionistSnapshot>): ReceptionistSnapshot {
  return {
    id: "front-desk",
    name: "Front desk",
    isDefault: true,
    greeting: "Welcome to the clinic.",
    voiceInstructions: "Front desk voice.",
    smsInstructions: "Front desk texts.",
    chatInstructions: "Front desk chat.",
    summary: "Front desk summary",
    bookingPolicy: "Confirm first.",
    transferPolicy: { mode: "on_request" },
    bookingMode: "instant",
    rules: [{ id: "rule-front", title: "Front", content: "Front rule", order: 0 }],
    excludedServiceIds: [],
    excludedKnowledgeDocumentIds: [],
    excludedSnippetIds: [],
    ...overrides,
  };
}

const business: BusinessContextSnapshot = {
  ...demoSnapshot,
  services: [
    { id: "svc-cleaning", name: "Cleaning", durationMinutes: 30 },
    { id: "svc-surgery", name: "Surgery", durationMinutes: 90 },
  ],
  knowledgeSnippets: [
    { id: "snip-parking", title: "Parking", content: "Free parking.", tags: [], priority: 1 },
    { id: "snip-prices", title: "Prices", content: "Ask us.", tags: [], priority: 0 },
  ],
  receptionists: [
    receptionist({}),
    receptionist({
      id: "after-hours",
      name: "After hours",
      isDefault: false,
      greeting: "You reached us after hours.",
      voice: "cedar",
      language: "fr",
      bookingMode: "request",
      transferPolicy: { mode: "never" },
      rules: [{ id: "rule-night", title: "Night", content: "Night rule", order: 0 }],
      excludedServiceIds: ["svc-surgery"],
      excludedKnowledgeDocumentIds: ["doc-pricing"],
      excludedSnippetIds: ["snip-prices"],
      knowledgeDigest: "{\"title\":\"FAQ\"}",
    }),
  ],
};

describe("snapshotForReceptionist", () => {
  it("projects the chosen receptionist over the business snapshot", () => {
    const projected = snapshotForReceptionist(business, "after-hours");
    expect(projected).toMatchObject({
      agentId: "after-hours",
      agentName: "After hours",
      voice: "cedar",
      defaultLocale: "fr",
      greeting: "You reached us after hours.",
      bookingMode: "request",
      transferPolicy: { mode: "never" },
      rules: [{ id: "rule-night" }],
      knowledgeDigest: "{\"title\":\"FAQ\"}",
      excludedKnowledgeDocumentIds: ["doc-pricing"],
      excludedServiceIds: ["svc-surgery"],
    });
    expect(projected.services.map((service) => service.id)).toEqual(["svc-cleaning"]);
    expect(projected.knowledgeSnippets?.map((snippet) => snippet.id)).toEqual(["snip-parking"]);
    expect(projected.receptionists).toBeUndefined();
    expect(projected.businessId).toBe(business.businessId);
  });

  it("falls back to the default receptionist for a missing or unknown id", () => {
    expect(snapshotForReceptionist(business).agentId).toBe("front-desk");
    expect(snapshotForReceptionist(business, "deleted").agentId).toBe("front-desk");
    const projected = snapshotForReceptionist(business, null);
    expect(projected.defaultLocale).toBe(business.defaultLocale);
    expect(projected.services).toHaveLength(2);
    expect(projected.voice).toBeUndefined();
  });

  it("leaves snapshots built before receptionists existed unchanged", () => {
    expect(snapshotForReceptionist(demoSnapshot, "anything")).toBe(demoSnapshot);
  });
});
