import { runtimeLocaleFromTag, runtimeLocales, type RuntimeLocale } from "./locales";

// Short words that show up in any page of running text. Words two languages
// share count for both, because only the gap between the top two decides.
const COMMON_WORDS: Record<RuntimeLocale, ReadonlySet<string>> = {
  en: new Set("the and for you your with our are this that from have will can about we".split(" ")),
  fr: new Set("le la les des et pour vous votre nos avec est une dans sur nous au aux du".split(" ")),
  es: new Set("el la los las y para usted su nuestros con es una en sobre nosotros del por que".split(" ")),
  // Serbian in both scripts, so a Cyrillic site isn't taken for Russian or Ukrainian.
  sr: new Set("i je u na za se da su od sa koji što naš vaš ili kao mi vi и је у на за се да су од са који што наш ваш или као ми ви".split(" ")),
  de: new Set("der die das und für sie ihre unsere mit ist eine auf wir von zu den nicht".split(" ")),
  pt: new Set("o a os as e para você seu nossos com é uma em sobre nós do da que".split(" ")),
  it: new Set("il la i gli e per voi vostro nostri con è una in su noi del della che".split(" ")),
  nl: new Set("de het een en voor u uw onze met is op wij van te niet ons bij".split(" ")),
  pl: new Set("i w na z do się nie jest że to jak dla od po przez nasz nasze oraz są czy ale już tylko który".split(" ")),
  tr: new Set("ve bir bu için ile da de en çok olan gibi daha size sizin bizim ne olarak mi var yok ama her kadar".split(" ")),
  vi: new Set("và của các cho là có được với những một trong này chúng tôi bạn không đã sẽ thì nhưng để khi rất cũng".split(" ")),
  tl: new Set("ang ng mga sa at ay para ito kami namin ninyo inyong po hindi si ni ko mo may kung".split(" ")),
  sv: new Set("och att det som en på är för med till av den vi har inte ni du".split(" ")),
  ru: new Set("и в на не что с по для это мы вы наш ваш как от к у то если или же вот так".split(" ")),
  uk: new Set("і в на не що з до для це ми ви наш ваш як від та у й є але або також".split(" ")),
};

const MIN_WORDS = 8;
const MIN_LEAD = 1.5;
const TEXT_SAMPLE_LENGTH = 20_000;

/** A page's `lang` attribute as a caller language, or null when it names none we speak. */
export function runtimeLocaleFromLangAttribute(value: string | null | undefined): RuntimeLocale | null {
  return runtimeLocaleFromTag(value);
}

/** The language of a text, or null when it's too short or too close to call. */
export function runtimeLocaleFromText(text: string): RuntimeLocale | null {
  const scores = new Map<RuntimeLocale, number>(runtimeLocales.map((locale) => [locale, 0]));
  for (const word of text.toLowerCase().match(/\p{L}+/gu) ?? []) {
    for (const locale of runtimeLocales) if (COMMON_WORDS[locale].has(word)) scores.set(locale, scores.get(locale)! + 1);
  }
  const [first, second] = [...scores.entries()].sort((left, right) => right[1] - left[1]);
  return first && second && first[1] >= MIN_WORDS && first[1] >= second[1] * MIN_LEAD ? first[0] : null;
}

/**
 * The language a website's pages are in: what most of their `lang` attributes
 * say, or their text when none names a language we speak. Null when neither
 * settles it.
 */
export function detectSiteLanguage(pages: ReadonlyArray<{ language?: string | undefined; markdown?: string | undefined }>): RuntimeLocale | null {
  const votes = new Map<RuntimeLocale, number>();
  for (const page of pages) {
    const locale = runtimeLocaleFromLangAttribute(page.language);
    if (locale) votes.set(locale, (votes.get(locale) ?? 0) + 1);
  }
  const [top] = [...votes.entries()].sort((left, right) => right[1] - left[1]);
  if (top) return top[0];
  return runtimeLocaleFromText(pages.map((page) => page.markdown ?? "").join("\n").slice(0, TEXT_SAMPLE_LENGTH));
}
