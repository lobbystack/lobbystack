import { describe, expect, it } from "vitest";

import { defaultGreeting, isDefaultGreeting, runtimeLocales } from "./index";

describe("defaultGreeting", () => {
  it("thanks the caller and asks how to help, in each caller language", () => {
    expect(runtimeLocales.map((locale) => defaultGreeting(" Maple Clinic ", locale))).toEqual([
      "Thanks for calling Maple Clinic. How can I help you today?",
      "Merci d'avoir appelé Maple Clinic. Comment puis-je vous aider aujourd'hui ?",
      "Gracias por llamar a Maple Clinic. ¿En qué puedo ayudarle hoy?",
      "Vielen Dank für Ihren Anruf bei Maple Clinic. Wie kann ich Ihnen heute helfen?",
      "Obrigado por ligar para Maple Clinic. Como posso ajudar você hoje?",
      "Grazie per aver chiamato Maple Clinic. Come posso aiutarla oggi?",
      "Bedankt voor het bellen naar Maple Clinic. Waarmee kan ik u vandaag helpen?",
    ]);
    expect(defaultGreeting("Maple Clinic")).toBe("Thanks for calling Maple Clinic. How can I help you today?");
  });
});

describe("isDefaultGreeting", () => {
  it("recognizes the default for the language, and the English one older businesses have", () => {
    expect(isDefaultGreeting(defaultGreeting("Clinic", "fr"), "Clinic", "fr")).toBe(true);
    expect(isDefaultGreeting("Thanks for calling Clinic.", "Clinic", "en")).toBe(true);
  });

  it("rejects an edited greeting and another language's default", () => {
    expect(isDefaultGreeting("Welcome to Clinic!", "Clinic", "en")).toBe(false);
    expect(isDefaultGreeting(defaultGreeting("Clinic", "en"), "Clinic", "fr")).toBe(false);
    expect(isDefaultGreeting("Thanks for calling Clinic.", "Clinic", "fr")).toBe(false);
  });
});
