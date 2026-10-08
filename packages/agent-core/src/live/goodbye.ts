// Farewells for the mutual goodbye that ends a call: the caller says one and
// the receptionist answers with one. Matched as whole words, ignoring case and
// accents. A space stands for any run of spaces and punctuation, and (?:a|b)
// lists alternatives. Left out on purpose, because a false hangup is worse
// than a missed one: words that also mean hello (ciao, ćao, salut, aloha, hej,
// zdravo, pozdrav), a bare "thanks" or "merci", Russian "пока", which also
// means "while", and "see you" or "à demain", which also fit a booking. A
// goodbye this misses still ends at the silence timeout, with a goodbye.
const FAREWELLS = {
  en: ["bye", "goodbye", "take care(?! of)", "have a (?:good|great|nice|lovely|wonderful) (?:day|evening|night|weekend|one)", "(?:thanks|thank you) that's (?:all|it|everything)", "that's (?:all|it|everything) (?:thanks|thank you)"],
  fr: ["au revoir", "bonne (?:journée|soirée|fin de journée|nuit)", "à bientôt", "à la prochaine", "merci (?:c'est tout|ce sera tout)", "(?:c'est tout|ce sera tout) merci"],
  es: ["adiós", "hasta (?:luego|pronto|la próxima)", "que (?:tenga|tengas) (?:un )?buen día", "cuídese", "cuídate", "gracias eso es todo", "eso es todo gracias"],
  sr: ["doviđenja", "dovidenja", "prijatno", "laku noć", "sve najbolje", "hvala to je sve", "to je sve hvala", "довиђења", "хвала то је све", "то је све хвала"],
  ru: ["до свидания", "всего (?:доброго|хорошего|наилучшего)", "хорошего дня", "прощайте", "всё спасибо", "спасибо это всё", "это всё спасибо"],
};

// Courtesies a caller answers a goodbye with, like "Thanks, you too!", and
// the fillers and yeses around them, as in "Okay, bye now" or "Oui, merci,
// au revoir". They don't start a hangup, but a turn made only of them and
// farewells doesn't cancel one either. Any other word, as in "okay, but one
// more question", does.
const COURTESIES = {
  en: ["(?:thanks|thank you)(?: (?:so|very) much)?", "you too", "same to you", "ok", "okay", "alright", "all right", "yes", "yeah", "yep", "great", "perfect", "now", "again", "a lot"],
  fr: ["merci(?: beaucoup)?", "vous aussi", "toi aussi", "oui", "d'accord", "parfait", "à vous", "à toi"],
  es: ["(?:muchas )?gracias", "igualmente", "sí", "vale", "perfecto"],
  sr: ["hvala(?: puno)?", "takođe", "i vama", "da", "vam", "vama", "u redu", "super", "хвала(?: пуно)?", "такође", "и вама"],
  ru: ["(?:большое )?спасибо(?: большое)?", "и вам", "и тебе", "да", "хорошо", "ладно"],
};

// Lowercase without accents or curly apostrophes, so "Всё" matches "все" and
// "That’s" matches "that's". NFD keeps "đ", so it becomes "dj", the way it's
// typed without the letter: "dovidjenja" matches "doviđenja".
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").replace(/[‘’ʼ`]/g, "'").toLowerCase().replaceAll("đ", "dj");

// Global, so onlyGoodbye removes every match; search() ignores the flag.
const phrases = (table: Record<string, string[]>) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${Object.values(table).flat().map((phrase) => fold(phrase).replaceAll(" ", "[\\s\\p{P}]+")).join("|")})(?![\\p{L}\\p{N}])`, "gu");
const FAREWELL = phrases(FAREWELLS);
const COURTESY = phrases(COURTESIES);

// What's left of the text once the phrases are gone, without spaces or punctuation.
const leftover = (text: string, ...patterns: RegExp[]) => patterns.reduce((rest, pattern) => rest.replace(pattern, " "), fold(text)).replace(/[\s\p{P}]/gu, "");

/** Whether the text says goodbye. */
export function saysGoodbye(text: string): boolean {
  return fold(text).search(FAREWELL) >= 0;
}

/** Whether the text only answers a goodbye, such as a "Bye!" said back or "Thanks, you too!". */
export function onlyGoodbye(text: string): boolean {
  return leftover(text, FAREWELL, COURTESY) === "";
}
