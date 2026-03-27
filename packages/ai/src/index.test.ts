import { describe, expect, it } from "vitest";

import { demoSnapshot } from "@ai-receptionist/shared";

import { buildVoiceSystemPrompt } from "./index";

describe("buildVoiceSystemPrompt", () => {
  it("does not anchor voice calls to the business default locale", () => {
    const prompt = buildVoiceSystemPrompt({
      ...demoSnapshot,
      defaultLocale: "fr",
      greeting: "Bonjour, merci d'avoir appele la clinique.",
    });

    expect(prompt).toContain("Start in the language implied by the configured greeting.");
    expect(prompt).toContain(
      "Adapt to the caller's language as soon as the caller clearly establishes one.",
    );
    expect(prompt).toContain(
      "When a caller asks for a callback or needs a human follow-up that cannot be transferred live, collect the key details and take a callback message for staff.",
    );
    expect(prompt).toContain(
      "For detailed questions about business policies, uploaded documents, or long-form knowledge, use the searchKnowledge tool instead of relying only on the summary.",
    );
    expect(prompt).toContain("Knowledge digest:");
    expect(prompt).not.toContain("Default conversation language:");
    expect(prompt).not.toContain("Speak in French unless the caller clearly asks to switch languages.");
    expect(prompt).not.toContain("Priority FAQs:");
  });
});
