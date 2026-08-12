import { describe, expect, it } from "vitest";

import { buildConversationSessionSummary } from "./conversationSummary";

describe("conversation session summaries", () => {
  it("prefers structured message-taking and disposition outcomes", () => {
    expect(buildConversationSessionSummary({ currentIntent: "message_taking", conversationSummary: "Call me tomorrow" })).toEqual({ kind: "message_taking", summary: "Call me tomorrow" });
    expect(buildConversationSessionSummary({ disposition: "spam" })).toEqual({ kind: "disposition", disposition: "spam" });
  });

  it("builds bounded locale-aware transcript summaries", () => {
    expect(buildConversationSessionSummary({ locale: "fr", transcript: ["Bonjour", "Je souhaite prendre rendez-vous"] })).toEqual({ kind: "summary", summary: "Résumé de l'appel : Bonjour Je souhaite prendre rendez-vous" });
    expect(buildConversationSessionSummary({ locale: "fr" })).toEqual({ kind: "summary", summary: "Interaction vocale terminée." });
  });
});
