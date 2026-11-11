// Scripted callers shared by live-call-eval.ts (GPT-Live over the API) and
// test-call.ts (a real phone call). Every call opens with OPENING and waits for
// the receptionist's answer; then the scenario's lines play, each after
// pauseMs of the caller's silence. Only the phone script can press keys.

import type { RuntimeLocale } from "@lobbystack/shared";

/**
 * A check-in on a quiet caller, however GPT-Live words it: "Are you still
 * there?", "Are you still with me?", "Are you still on the line?", "Can you
 * hear me?", or a line that opens with "Hello?". A goodbye or an answer
 * without a check-in doesn't match.
 */
export const SILENCE_CHECK_IN = /\b(?:still (?:there|with me|on the line|here)|are you there|can you hear me)\b|^\s*hello\s*[?？]/imu;

/** Words the caller says, or keys they press on the phone's keypad (0-9, * and #). */
export type CallerLine = { text: string; pauseMs?: number } | { digits: string; pauseMs?: number };

export type CallScenario = {
  name: string;
  /** "ends": the receptionist should hang up after the last line. "continues": the call should go on. */
  expect: "ends" | "continues";
  lines: CallerLine[];
  /** The eval fails a run when any of the receptionist's lines matches this. The phone script can't check it. */
  mustNotSay?: RegExp;
  /** The eval fails an English run when none of the receptionist's lines matches this. */
  mustSay?: RegExp;
  /**
   * How long the caller stays silent after the last line, waiting for the
   * receptionist to hang up. It must stay under the silence check-ins'
   * goodbye for a call that should go on. The default is END_SILENCE_MS.
   */
  endSilenceMs?: number;
};

/** Shorter than the two silence check-ins and their goodbye, so a call that goes on isn't ended by silence first. */
export const END_SILENCE_MS = 15_000;

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
  // The caller goes quiet after the answer. The receptionist asks twice whether
  // they're still there, then says goodbye and hangs up, about 30 seconds in.
  { name: "silent", expect: "ends", lines: [], endSilenceMs: 50_000, mustSay: SILENCE_CHECK_IN },
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
  pl: {
    [OPENING]: "Dzień dobry, czy macie otwarte w sobotę?",
    "Okay, perfect. That is all I needed. Thanks, bye!": "Dobrze, świetnie. To wszystko. Dziękuję, do widzenia!",
    "No, that's everything. Goodbye!": "Nie, to wszystko. Do widzenia!",
    "Great, thank you so much. Have a good day, bye bye.": "Super, bardzo dziękuję. Miłego dnia, pa pa.",
    "Nope, that's it. Thanks.": "Nie, to już wszystko. Dziękuję.",
    "No, that's everything.": "Nie, to wszystko.",
    "Goodbye!": "Do widzenia!",
    "Oh wait, one more thing.": "A, chwileczkę, jeszcze jedno.",
    "Do you have parking?": "Czy macie parking?",
    "Ah no, I actually have to go. Bye bye.": "Nie, właściwie muszę już iść. Pa pa.",
  },
  tr: {
    [OPENING]: "Merhaba, cumartesi günü açık mısınız?",
    "Okay, perfect. That is all I needed. Thanks, bye!": "Tamam, harika. İhtiyacım olan buydu. Teşekkürler, hoşça kalın!",
    "No, that's everything. Goodbye!": "Hayır, bu kadar. Hoşça kalın!",
    "Great, thank you so much. Have a good day, bye bye.": "Harika, çok teşekkür ederim. İyi günler, görüşmek üzere.",
    "Nope, that's it. Thanks.": "Yok, bu kadar. Teşekkürler.",
    "No, that's everything.": "Hayır, bu kadar.",
    "Goodbye!": "Hoşça kalın!",
    "Oh wait, one more thing.": "Ah, bir dakika, bir şey daha var.",
    "Do you have parking?": "Otoparkınız var mı?",
    "Ah no, I actually have to go. Bye bye.": "Ah, hayır, aslında gitmem gerekiyor. Görüşürüz.",
  },
  vi: {
    [OPENING]: "Xin chào, thứ Bảy bên mình có mở cửa không?",
    "Okay, perfect. That is all I needed. Thanks, bye!": "Vâng, tuyệt quá. Tôi chỉ cần vậy thôi. Cảm ơn, tạm biệt!",
    "No, that's everything. Goodbye!": "Không, vậy là đủ rồi. Tạm biệt!",
    "Great, thank you so much. Have a good day, bye bye.": "Tuyệt quá, cảm ơn nhiều. Chúc một ngày tốt lành, tạm biệt.",
    "Nope, that's it. Thanks.": "Không, vậy thôi. Cảm ơn.",
    "No, that's everything.": "Không, vậy là đủ rồi.",
    "Goodbye!": "Tạm biệt!",
    "Oh wait, one more thing.": "À khoan, còn một việc nữa.",
    "Do you have parking?": "Bên mình có chỗ đậu xe không?",
    "Ah no, I actually have to go. Bye bye.": "À thôi, tôi phải đi rồi. Tạm biệt nhé.",
  },
  tl: {
    [OPENING]: "Hello po, bukas po ba kayo sa Sabado?",
    "Okay, perfect. That is all I needed. Thanks, bye!": "Sige, ayos. Iyon lang ang kailangan ko. Salamat, bye!",
    "No, that's everything. Goodbye!": "Wala na po, iyon lang. Sige po, bye!",
    "Great, thank you so much. Have a good day, bye bye.": "Ayos, maraming salamat po. Magandang araw, bye bye.",
    "Nope, that's it. Thanks.": "Wala na, iyon lang. Salamat.",
    "No, that's everything.": "Wala na po, iyon lang.",
    "Goodbye!": "Bye po!",
    "Oh wait, one more thing.": "Ay teka, may isa pa pala.",
    "Do you have parking?": "May parking po ba kayo?",
    "Ah no, I actually have to go. Bye bye.": "Ay hindi, kailangan ko na palang umalis. Bye bye.",
  },
  sv: {
    [OPENING]: "Hej, har ni öppet på lördag?",
    "Okay, perfect. That is all I needed. Thanks, bye!": "Okej, perfekt. Det var allt jag behövde. Tack, hej då!",
    "No, that's everything. Goodbye!": "Nej, det var allt. Hej då!",
    "Great, thank you so much. Have a good day, bye bye.": "Toppen, tack så mycket. Ha en bra dag, hej hej.",
    "Nope, that's it. Thanks.": "Nej, det var det. Tack.",
    "No, that's everything.": "Nej, det var allt.",
    "Goodbye!": "Hej då!",
    "Oh wait, one more thing.": "Åh vänta, en sak till.",
    "Do you have parking?": "Har ni parkering?",
    "Ah no, I actually have to go. Bye bye.": "Ah nej, jag måste faktiskt gå. Hej hej.",
  },
  ru: {
    [OPENING]: "Здравствуйте, вы работаете в субботу?",
    "Okay, perfect. That is all I needed. Thanks, bye!": "Хорошо, отлично. Это всё, что мне было нужно. Спасибо, до свидания!",
    "No, that's everything. Goodbye!": "Нет, это всё. До свидания!",
    "Great, thank you so much. Have a good day, bye bye.": "Отлично, большое спасибо. Хорошего дня, до свидания!",
    "Nope, that's it. Thanks.": "Нет, это всё. Спасибо.",
    "No, that's everything.": "Нет, это всё.",
    "Goodbye!": "До свидания!",
    "Oh wait, one more thing.": "Ой, подождите, ещё один вопрос.",
    "Do you have parking?": "У вас есть парковка?",
    "Ah no, I actually have to go. Bye bye.": "Ой, нет, мне на самом деле пора идти. До свидания!",
  },
  uk: {
    [OPENING]: "Добрий день, ви працюєте в суботу?",
    "Okay, perfect. That is all I needed. Thanks, bye!": "Добре, чудово. Це все, що мені було потрібно. Дякую, до побачення!",
    "No, that's everything. Goodbye!": "Ні, це все. До побачення!",
    "Great, thank you so much. Have a good day, bye bye.": "Чудово, щиро дякую. Гарного дня, бувайте.",
    "Nope, that's it. Thanks.": "Ні, це все. Дякую.",
    "No, that's everything.": "Ні, це все.",
    "Goodbye!": "До побачення!",
    "Oh wait, one more thing.": "Ой, зачекайте, ще одне питання.",
    "Do you have parking?": "У вас є парковка?",
    "Ah no, I actually have to go. Bye bye.": "Ой, ні, мені вже треба йти. Бувайте.",
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
