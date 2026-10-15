// Scripted callers shared by live-call-eval.ts (GPT-Live over the API) and
// test-call.ts (a real phone call). Every call opens with OPENING and waits for
// the receptionist's answer; then the scenario's lines play, each after
// pauseMs of the caller's silence.

import type { RuntimeLocale } from "@lobbystack/shared";

export type CallerLine = { text: string; pauseMs?: number };

export type CallScenario = {
  name: string;
  /** "ends": the receptionist should hang up after the last line. "continues": the call should go on. */
  expect: "ends" | "continues";
  lines: CallerLine[];
};

export const OPENING = "Hi, are you open on Saturday?";

export const SCENARIOS: CallScenario[] = [
  { name: "thanks-bye", expect: "ends", lines: [{ text: "Okay, perfect. That is all I needed. Thanks, bye!" }] },
  { name: "goodbye", expect: "ends", lines: [{ text: "No, that's everything. Goodbye!" }] },
  { name: "good-day", expect: "ends", lines: [{ text: "Great, thank you so much. Have a good day, bye bye." }] },
  { name: "thats-it", expect: "ends", lines: [{ text: "Nope, that's it. Thanks." }] },
  // The caller answers the receptionist's goodbye with their own.
  { name: "trailing-goodbye", expect: "ends", lines: [{ text: "No, that's everything." }, { text: "Goodbye!", pauseMs: 1_500 }] },
  // The caller pauses before the question, so the receptionist mustn't hang up meanwhile.
  { name: "one-more-thing", expect: "continues", lines: [{ text: "No, that's everything." }, { text: "Oh wait, one more thing.", pauseMs: 3_000 }, { text: "Do you have parking?", pauseMs: 3_000 }] },
];

// Scenarios that book a real appointment, so they run only by name.
const BOOKING_SCENARIOS: CallScenario[] = [
  // The caller turns down texts only after accepting the time, so the booking
  // can come before the answer. No confirmation text may follow. It asks for
  // staging's "Initial consultation"; check the contact's answer and the
  // texts, then cancel the appointment.
  { name: "book-no-texts", expect: "continues", lines: [{ text: "Okay. Can I book an initial consultation on Tuesday at 10 AM? My name is Sam Lee." }, { text: "Yes, please book it.", pauseMs: 15_000 }, { text: "And no text messages, please.", pauseMs: 12_000 }] },
];

// OPENING and the lines of SCENARIOS in the other caller languages, keyed by the English line.
const TRANSLATED_LINES: Record<Exclude<RuntimeLocale, "en">, Record<string, string>> = {
  fr: {
    [OPENING]: "Bonjour, est-ce que vous êtes ouverts le samedi ?",
    "Okay, perfect. That is all I needed. Thanks, bye!": "D'accord, parfait. C'est tout ce qu'il me fallait. Merci, au revoir !",
    "No, that's everything. Goodbye!": "Non, ce sera tout. Au revoir !",
    "Great, thank you so much. Have a good day, bye bye.": "Super, merci beaucoup. Bonne journée, au revoir.",
    "Nope, that's it. Thanks.": "Non, c'est tout. Merci.",
    "No, that's everything.": "Non, ce sera tout.",
    "Goodbye!": "Au revoir !",
    "Oh wait, one more thing.": "Ah, attendez, encore une chose.",
    "Do you have parking?": "Est-ce que vous avez un stationnement ?",
  },
  es: {
    [OPENING]: "Hola, ¿abren los sábados?",
    "Okay, perfect. That is all I needed. Thanks, bye!": "Muy bien, perfecto. Eso es todo lo que necesitaba. Gracias, ¡adiós!",
    "No, that's everything. Goodbye!": "No, eso es todo. ¡Adiós!",
    "Great, thank you so much. Have a good day, bye bye.": "Genial, muchas gracias. Que tenga un buen día, adiós.",
    "Nope, that's it. Thanks.": "No, nada más. Gracias.",
    "No, that's everything.": "No, eso es todo.",
    "Goodbye!": "¡Adiós!",
    "Oh wait, one more thing.": "Ah, espere, una cosa más.",
    "Do you have parking?": "¿Tienen estacionamiento?",
  },
  sr: {
    [OPENING]: "Dobar dan, da li radite u subotu?",
    "Okay, perfect. That is all I needed. Thanks, bye!": "Dobro, savršeno. To je sve što mi je trebalo. Hvala, prijatno!",
    "No, that's everything. Goodbye!": "Ne, to je sve. Doviđenja!",
    "Great, thank you so much. Have a good day, bye bye.": "Odlično, hvala vam puno. Prijatan dan, ćao, ćao.",
    "Nope, that's it. Thanks.": "Ne, to bi bilo to. Hvala.",
    "No, that's everything.": "Ne, to je sve.",
    "Goodbye!": "Doviđenja!",
    "Oh wait, one more thing.": "A, čekajte, još nešto.",
    "Do you have parking?": "Da li imate parking?",
  },
  de: {
    [OPENING]: "Hallo, haben Sie am Samstag geöffnet?",
    "Okay, perfect. That is all I needed. Thanks, bye!": "Okay, perfekt. Das war alles, was ich brauchte. Danke, tschüss!",
    "No, that's everything. Goodbye!": "Nein, das ist alles. Auf Wiederhören!",
    "Great, thank you so much. Have a good day, bye bye.": "Super, vielen Dank. Einen schönen Tag noch, tschüss.",
    "Nope, that's it. Thanks.": "Nein, das war's. Danke.",
    "No, that's everything.": "Nein, das ist alles.",
    "Goodbye!": "Auf Wiederhören!",
    "Oh wait, one more thing.": "Ach, warten Sie, noch eine Sache.",
    "Do you have parking?": "Gibt es bei Ihnen Parkplätze?",
  },
  pt: {
    [OPENING]: "Oi, vocês abrem no sábado?",
    "Okay, perfect. That is all I needed. Thanks, bye!": "Tá bom, perfeito. Era só isso que eu precisava. Obrigado, tchau!",
    "No, that's everything. Goodbye!": "Não, é só isso. Tchau!",
    "Great, thank you so much. Have a good day, bye bye.": "Ótimo, muito obrigado. Tenha um bom dia, tchau tchau.",
    "Nope, that's it. Thanks.": "Não, só isso mesmo. Obrigado.",
    "No, that's everything.": "Não, é só isso.",
    "Goodbye!": "Tchau!",
    "Oh wait, one more thing.": "Ah, espera, mais uma coisa.",
    "Do you have parking?": "Vocês têm estacionamento?",
  },
  it: {
    [OPENING]: "Buongiorno, siete aperti il sabato?",
    "Okay, perfect. That is all I needed. Thanks, bye!": "Va bene, perfetto. Era tutto quello che mi serviva. Grazie, arrivederci!",
    "No, that's everything. Goodbye!": "No, è tutto. Arrivederci!",
    "Great, thank you so much. Have a good day, bye bye.": "Ottimo, grazie mille. Buona giornata, arrivederci.",
    "Nope, that's it. Thanks.": "No, basta così. Grazie.",
    "No, that's everything.": "No, è tutto.",
    "Goodbye!": "Arrivederci!",
    "Oh wait, one more thing.": "Ah, aspetti, un'altra cosa.",
    "Do you have parking?": "Avete un parcheggio?",
  },
  nl: {
    [OPENING]: "Hallo, zijn jullie op zaterdag open?",
    "Okay, perfect. That is all I needed. Thanks, bye!": "Oké, perfect. Dat was alles wat ik nodig had. Bedankt, doei!",
    "No, that's everything. Goodbye!": "Nee, dat is alles. Tot ziens!",
    "Great, thank you so much. Have a good day, bye bye.": "Super, heel erg bedankt. Nog een fijne dag, doei doei.",
    "Nope, that's it. Thanks.": "Nee, dat was het. Bedankt.",
    "No, that's everything.": "Nee, dat is alles.",
    "Goodbye!": "Tot ziens!",
    "Oh wait, one more thing.": "O wacht, nog één ding.",
    "Do you have parking?": "Is er parkeergelegenheid?",
  },
};

/** A caller's line in the call's language. Only OPENING and SCENARIOS have lines in every language. */
export function callerLine(text: string, locale: RuntimeLocale): string {
  if (locale === "en") return text;
  const line = TRANSLATED_LINES[locale][text];
  if (!line) throw new Error(`No ${locale} line for "${text}". Add it to TRANSLATED_LINES in scripts/voice/scenarios.ts.`);
  return line;
}

export function findScenarios(names: string[]): CallScenario[] {
  if (!names.length) return SCENARIOS;
  const all = [...SCENARIOS, ...BOOKING_SCENARIOS];
  return names.map((name) => {
    const scenario = all.find((item) => item.name === name);
    if (!scenario) throw new Error(`Unknown scenario "${name}". Scenarios: ${all.map((item) => item.name).join(", ")}.`);
    return scenario;
  });
}
