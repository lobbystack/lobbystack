import { describe, expect, it } from "vitest";

import { onlyGoodbye, saysGoodbye } from "./goodbye";

describe("saysGoodbye", () => {
  it.each(["Goodbye", "Okay. Take care.", "Bye-bye!", "Thank you, that’s all.", "AU REVOIR", "Merci, c'est tout.", "À bientôt", "Hasta luego", "Que tenga un buen día", "Doviđenja", "Hvala, to je sve.", "Всё, спасибо", "Всего доброго!", "Dovidjenja", "DOVIDJENJA", "Dovidenja", "Довиђења!", "Хвала, то је све."])("hears a goodbye in %j", (text) => {
    expect(saysGoodbye(text)).toBe(true);
  });

  // Words that also mean hello, a bare thanks, and phrases that also fit mid-call.
  it.each(["Ciao!", "Ćao", "Salut", "Aloha", "Hej", "Thanks.", "Merci", "Спасибо", "I'll take care of that.", "C'est tout ?", "Пока я ищу номер", "See you Tuesday!", "Is that a baby?", "goodbyes", "Okay.", "Yes, perfect.", "Da, hvala.", "Хвала.", "Oui, d'accord."])("hears none in %j", (text) => {
    expect(saysGoodbye(text)).toBe(false);
  });
});

describe("onlyGoodbye", () => {
  it.each(["Bye, take care!", "Thanks, you too!", "Thanks so much, you too.", "Same to you!", "Merci, vous aussi !", "Gracias, igualmente.", "Hvala, i vama.", "Спасибо, и вам!", "Thanks, bye!", "Thank you so much, same to you.",
    // Fillers and yeses around the goodbye, from the review.
    "Okay, bye", "Alright, thank you, bye", "Yes, thank you, goodbye", "Bye now", "Thanks a lot, bye!", "Thanks again. Bye!", "Hvala vam, doviđenja", "Da, hvala, doviđenja", "Merci à vous, au revoir", "Oui, merci, au revoir", "Sí, gracias, adiós", "Да, хорошо, до свидания",
    // Serbian typed without "đ", and in Cyrillic.
    "Hvala, takodje, dovidjenja!", "Хвала, такође, довиђења", "Хвала и вама!"])("takes %j for an answer to a goodbye", (text) => {
    expect(onlyGoodbye(text)).toBe(true);
  });

  // Any word outside the farewells and courtesies is more to say, which cancels the hangup.
  it.each(["Bye! Oh, one more thing.", "Thanks, but can I also ask about parking?", "Merci, mais j'ai une autre question.", " [pressed 1]", "Okay, but one more question.", "Yes, actually, can I move it?", "Oh wait—", "Da, ali imam još jedno pitanje."])("takes %j for more to say", (text) => {
    expect(onlyGoodbye(text)).toBe(false);
  });
});
