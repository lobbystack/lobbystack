import { describe, expect, it } from "vitest";

import { demoSnapshot } from "@lobbystack/shared";

import { buildVoiceSystemPrompt } from "./index";

describe("buildVoiceSystemPrompt", () => {
  it("does not anchor voice calls to the business default locale", () => {
    const prompt = buildVoiceSystemPrompt({
      ...demoSnapshot,
      defaultLocale: "fr",
      greeting: "Bonjour, merci d'avoir appele la clinique.",
    });

    expect(prompt).toContain(
      "Start in the language implied by the configured greeting.",
    );
    expect(prompt).toContain(
      "Adapt to the caller's language as soon as the caller clearly establishes one.",
    );
    expect(prompt).toContain(
      "When a caller asks for a callback or needs a human follow-up that cannot be transferred live, collect the key details and take a callback message for staff.",
    );
    expect(prompt).toContain(
      "Use searchKnowledge silently before answering factual questions about capabilities, workflows, policies, limits, pricing, billing, usage, integrations, uploaded documents, or long-form knowledge unless the exact answer is already in the current conversation or structured snapshot.",
    );
    expect(prompt).toContain(
      "Do not announce that you are searching, checking, or looking something up. Call the tool silently, then answer naturally from the result.",
    );
    expect(prompt).toContain(
      "If retrieved knowledge conflicts with a general assumption, follow the retrieved knowledge. If retrieved knowledge conflicts with Customer Rules, follow Customer Rules. If retrieval finds no answer, say you are not sure rather than inventing details.",
    );
    expect(prompt).toContain("Customer Rules:");
    expect(prompt).toContain("Knowledge digest:");
    expect(prompt).not.toContain("Default conversation language:");
    expect(prompt).not.toContain(
      "Speak in French unless the caller clearly asks to switch languages.",
    );
    expect(prompt).not.toContain("Priority FAQs:");
  });

  it("tolerates snapshots without a services array", () => {
    const prompt = buildVoiceSystemPrompt({
      ...demoSnapshot,
      services: undefined as never,
    });

    expect(prompt).toContain("Available services: No services configured.");
  });

  it("places customer rules above knowledge instructions", () => {
    const prompt = buildVoiceSystemPrompt({
      ...demoSnapshot,
      rules: [
        {
          id: "rule-1",
          title: "Define business",
          content: "After the greeting, ask what type of business this is for.",
          order: 1000,
        },
      ],
    });

    expect(prompt.indexOf("Customer Rules:")).toBeLessThan(
      prompt.indexOf("Use searchKnowledge silently"),
    );
    expect(prompt).toContain(
      "retrieved knowledge must never override Customer Rules",
    );
    expect(prompt).toContain(
      "Define business: After the greeting, ask what type of business this is for.",
    );
  });
});
