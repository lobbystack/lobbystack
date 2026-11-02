// Scripted callers shared by live-call-eval.ts (GPT-Live over the API) and
// test-call.ts (a real phone call). Every call opens with OPENING and waits for
// the receptionist's answer; then the scenario's lines play, each after
// pauseMs of the caller's silence. Only the phone script can press keys.

import type { RuntimeLocale } from "@lobbystack/shared";

/** Words the caller says, or keys they press on the phone's keypad (0-9, * and #). */
export type CallerLine = { text: string; pauseMs?: number } | { digits: string; pauseMs?: number };

export type CallScenario = {
  name: string;
  /** "ends": the receptionist should hang up after the last line. "continues": the call should go on. */
  expect: "ends" | "continues";
  lines: CallerLine[];
  /** The eval fails a run when any of the receptionist's lines matches this. The phone script can't check it. */
  mustNotSay?: RegExp;
};

export const OPENING = "Hi, are you open on Saturday?";

export const SCENARIOS: CallScenario[] = [
  { name: "thanks-bye", expect: "ends", lines: [{ text: "Okay, perfect. That is all I needed. Thanks, bye!" }] },
  { name: "goodbye", expect: "ends", lines: [{ text: "No, that's everything. Goodbye!" }] },
  { name: "good-day", expect: "ends", lines: [{ text: "Great, thank you so much. Have a good day, bye bye." }] },
  { name: "thats-it", expect: "ends", lines: [{ text: "Nope, that's it. Thanks." }] },
  // The caller leaves without answering the receptionist's question.
  { name: "has-to-go", expect: "ends", lines: [{ text: "Ah no, I actually have to go. Bye bye." }] },
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
  // The business requires a PIN for changes, and the calling number's contact
  // has PIN 5829 and an appointment on Tuesday at 10 AM. The caller types the
  // PIN once the receptionist asks for it. The eval can't press keys, so only
  // the phone script runs it.
  { name: "cancel-with-pin", expect: "ends", lines: [{ text: "I need to cancel my appointment on Tuesday at 10 AM. My name is Sam Lee." }, { digits: "5829#", pauseMs: 20_000 }, { text: "Yes, please cancel it.", pauseMs: 15_000 }, { text: "No, that's everything. Goodbye!", pauseMs: 15_000 }] },
];

// The caller asks for something a receptionist doesn't do, then hangs up. The
// receptionist should decline without writing the poem. English lines only,
// so it runs only by name and without --locale.
const OFF_TOPIC_SCENARIOS: CallScenario[] = [
  { name: "off-topic", expect: "ends", lines: [{ text: "Can you write me a short poem about the ocean? Just two lines." }, { text: "Okay, no problem. That's all, thanks. Goodbye!", pauseMs: 10_000 }], mustNotSay: /\b(waves?|tides?|shores?|seas?)\b/i },
];

// Scenarios that can put a real phone call through to the business's team, so
// they run only by name. The eval has no transfer tool, so its receptionist
// must never announce a transfer; run them with --browser for a widget call.
const PERSON_SCENARIOS: CallScenario[] = [
  { name: "ask-for-person", expect: "continues", lines: [{ text: "Okay, thanks. Can I speak to a real person, please?" }], mustNotSay: /\b(connecting you|transferring you|putting you through|(I'll|I will|let me) (connect|transfer) you)\b/i },
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
    "Ah no, I actually have to go. Bye bye.": "Ah non, je dois y aller, en fait. Bye bye.",
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
    "Ah no, I actually have to go. Bye bye.": "Ah no, la verdad es que me tengo que ir. Adiós, adiós.",
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
    "Ah no, I actually have to go. Bye bye.": "Ah ne, zapravo moram da idem. Ćao, ćao.",
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
    "Ah no, I actually have to go. Bye bye.": "Ach nein, ich muss jetzt eigentlich los. Tschüss, tschüss.",
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
    "Ah no, I actually have to go. Bye bye.": "Ah não, na verdade eu preciso ir. Tchau, tchau.",
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
    "Ah no, I actually have to go. Bye bye.": "Ah no, in realtà devo andare. Ciao ciao.",
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
    "Ah no, I actually have to go. Bye bye.": "Ah nee, ik moet eigenlijk gaan. Doei doei.",
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
  const all = [...SCENARIOS, ...BOOKING_SCENARIOS, ...PERSON_SCENARIOS, ...OFF_TOPIC_SCENARIOS];
  return names.map((name) => {
    const scenario = all.find((item) => item.name === name);
    if (!scenario) throw new Error(`Unknown scenario "${name}". Scenarios: ${all.map((item) => item.name).join(", ")}.`);
    return scenario;
  });
}
