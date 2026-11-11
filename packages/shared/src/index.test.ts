import { describe, expect, it } from "vitest";

import { defaultAgentName, defaultGreeting, isDefaultAgentName, isDefaultGreeting, runtimeLocales } from "./index";

describe("defaultAgentName", () => {
  it("names the first agent Default agent in every caller language", () => {
    expect(runtimeLocales.map((locale) => [locale, defaultAgentName(locale)])).toEqual([
      ["en", "Default agent"],
      ["fr", "Agent par défaut"],
      ["es", "Agente predeterminado"],
      ["sr", "Podrazumevani agent"],
      ["de", "Standard-Agent"],
      ["pt", "Agente padrão"],
      ["it", "Agente predefinito"],
      ["nl", "Standaardagent"],
      ["pl", "Domyślny agent"],
      ["tr", "Varsayılan asistan"],
      ["vi", "Trợ lý mặc định"],
      ["tl", "Default na assistant"],
      ["sv", "Standardagent"],
      ["ru", "Агент по умолчанию"],
      ["uk", "Агент за замовчуванням"],
    ]);
  });

  it("uses English when no language is given", () => {
    expect(defaultAgentName()).toBe("Default agent");
  });
});

describe("isDefaultAgentName", () => {
  it("knows the name in any language, and no name an operator chose", () => {
    expect(isDefaultAgentName("Agente predeterminado")).toBe(true);
    expect(isDefaultAgentName("Default agent")).toBe(true);
    expect(isDefaultAgentName("Front desk")).toBe(false);
  });

  it("no longer counts the names first agents had before Default agent", () => {
    expect(isDefaultAgentName("Agent")).toBe(false);
    expect(isDefaultAgentName("Agente")).toBe(false);
  });
});

describe("defaultGreeting", () => {
  it("thanks the caller and asks how to help, in each caller language", () => {
    expect(runtimeLocales.map((locale) => defaultGreeting(" Maple Clinic ", locale))).toEqual([
      "Thanks for calling Maple Clinic. How can I help you today?",
      "Merci d'avoir appelé Maple Clinic. Comment puis-je vous aider aujourd'hui ?",
      "Gracias por llamar a Maple Clinic. ¿En qué puedo ayudarle hoy?",
      "Hvala što ste pozvali Maple Clinic. Kako mogu da vam pomognem danas?",
      "Vielen Dank für Ihren Anruf bei Maple Clinic. Wie kann ich Ihnen heute helfen?",
      "Agradecemos sua ligação para Maple Clinic. Como posso ajudar você hoje?",
      "Grazie per aver chiamato Maple Clinic. Come posso aiutarla oggi?",
      "Bedankt voor het bellen naar Maple Clinic. Waarmee kan ik u vandaag helpen?",
      "Dziękujemy za telefon, tu Maple Clinic. W czym mogę dziś pomóc?",
      "Aradığınız için teşekkür ederiz, burası Maple Clinic. Bugün size nasıl yardımcı olabilirim?",
      "Cảm ơn quý khách đã gọi đến Maple Clinic. Tôi có thể giúp gì cho quý khách hôm nay?",
      "Salamat po sa pagtawag sa Maple Clinic. Paano ko po kayo matutulungan ngayon?",
      "Tack för att du ringer Maple Clinic. Hur kan jag hjälpa dig i dag?",
      "Спасибо за звонок, это Maple Clinic. Чем я могу вам помочь сегодня?",
      "Дякуємо за дзвінок, це Maple Clinic. Чим я можу вам допомогти сьогодні?",
    ]);
    expect(defaultGreeting("Maple Clinic")).toBe("Thanks for calling Maple Clinic. How can I help you today?");
  });
});

describe("isDefaultGreeting", () => {
  it("recognizes the default for the language, and the English and Portuguese ones older businesses have", () => {
    expect(isDefaultGreeting(defaultGreeting("Clinic", "fr"), "Clinic", "fr")).toBe(true);
    expect(isDefaultGreeting("Thanks for calling Clinic.", "Clinic", "en")).toBe(true);
    expect(isDefaultGreeting("Obrigado por ligar para Clinic. Como posso ajudar você hoje?", "Clinic", "pt")).toBe(true);
  });

  it("rejects an edited greeting and another language's default", () => {
    expect(isDefaultGreeting("Welcome to Clinic!", "Clinic", "en")).toBe(false);
    expect(isDefaultGreeting(defaultGreeting("Clinic", "en"), "Clinic", "fr")).toBe(false);
    expect(isDefaultGreeting("Thanks for calling Clinic.", "Clinic", "fr")).toBe(false);
  });
});
