import { describe, expect, it } from "vitest";

import { buildConversationSessionSummary, extractCallerContext } from "./conversationSummary";

describe("conversation session summaries", () => {
  it("prefers structured message-taking and disposition outcomes", () => {
    expect(buildConversationSessionSummary({ currentIntent: "message_taking", conversationSummary: "Call me tomorrow" })).toEqual({ kind: "message_taking", summary: "Call me tomorrow" });
    expect(buildConversationSessionSummary({ disposition: "spam" })).toEqual({ kind: "disposition", disposition: "spam" });
  });

  it("builds bounded locale-aware transcript summaries", () => {
    expect(buildConversationSessionSummary({ locale: "fr", transcript: ["Bonjour", "Je souhaite prendre rendez-vous"] })).toEqual({ kind: "summary", summary: "Résumé de l'appel : Bonjour Je souhaite prendre rendez-vous" });
    expect(buildConversationSessionSummary({ locale: "fr" })).toEqual({ kind: "summary", summary: "Interaction vocale terminée." });
  });

  it("extracts a stated caller name and the first substantive reason", () => {
    const transcript = [
      { speaker: "assistant", text: "Who do I have the pleasure of speaking with?" },
      { speaker: "caller", text: "Hello, my name is Rafael." },
      { speaker: "assistant", text: "How can I help?" },
      { speaker: "caller", text: "What do you guys sell?" },
    ];

    expect(extractCallerContext(transcript)).toEqual({
      callerName: "Rafael",
      callReason: "What do you guys sell?",
    });
    expect(buildConversationSessionSummary({ disposition: "caller_finished", transcript })).toEqual({
      kind: "summary",
      summary: "What do you guys sell?",
    });
  });

  it("keeps a reason stated in the same turn as the caller name", () => {
    expect(extractCallerContext([
      { speaker: "caller", text: "This is Raphaël. I was wondering how many languages you support?" },
    ])).toEqual({
      callerName: "Raphaël",
      callReason: "I was wondering how many languages you support?",
    });
  });
});
