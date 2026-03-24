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
    expect(prompt).not.toContain("Default conversation language:");
    expect(prompt).not.toContain("Speak in French unless the caller clearly asks to switch languages.");
  });
});
