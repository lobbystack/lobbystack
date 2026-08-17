import { describe, expect, it } from "vitest";

import { demoSnapshot } from "@lobbystack/shared";

import { buildChatSystemPrompt, buildSmsSystemPrompt, buildVoiceSystemPrompt } from "./index";

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
      prompt.indexOf("If retrieved knowledge conflicts"),
    );
    expect(prompt).toContain(
      "retrieved knowledge must never override Customer Rules",
    );
    expect(prompt).toContain(
      "Define business: After the greeting, ask what type of business this is for.",
    );
  });
});

describe("buildSmsSystemPrompt", () => {
  it("includes the snapshot rules and structured business facts", () => {
    const prompt = buildSmsSystemPrompt(demoSnapshot);

    expect(prompt).toContain("Customer Rules:");
    expect(prompt).toContain("Urgent escalation:");
    expect(prompt).toContain("Business summary:");
    expect(prompt).toContain("Booking policy:");
    expect(prompt).toContain("Knowledge digest:");
  });
});

describe("buildChatSystemPrompt", () => {
  it("anchors the widget to a live chat and includes instructions and facts", () => {
    const prompt = buildChatSystemPrompt({
      ...demoSnapshot,
      chatInstructions: "Stay concise in the widget.",
    });

    expect(prompt).toContain("This is a live website chat conversation, not a phone call or SMS thread.");
    expect(prompt).toContain("Stay concise in the widget.");
    expect(prompt).toContain("Customer Rules:");
    expect(prompt).toContain("Business summary:");
    expect(prompt).toContain("Booking policy:");
    expect(prompt).toContain("Knowledge digest:");
    expect(prompt).toContain("Available services: General Checkup (30 min)");
    expect(prompt).not.toContain("This is an SMS conversation.");
  });
});
