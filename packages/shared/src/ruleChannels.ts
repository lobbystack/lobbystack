import type { RuntimeLocale } from "./locales";

/**
 * The channels a rule can be kept to. A rule with none applies on every
 * channel. voice covers phone calls and browser test calls.
 */
export const ruleChannels = ["voice", "sms", "web_chat", "instagram"] as const;
export type RuleChannel = (typeof ruleChannels)[number];

export function isRuleChannel(value: unknown): value is RuleChannel {
  return (ruleChannels as readonly unknown[]).includes(value);
}

/** The rule channel a conversation's channel follows. Null for a channel no rule can be kept to. */
export function ruleChannelOf(channel: string | null | undefined): RuleChannel | null {
  if (channel === "voice" || channel === "web_voice") return "voice";
  return isRuleChannel(channel) ? channel : null;
}

/**
 * Longest text calls read from a rule kept to one channel: what the old
 * per-channel instructions held. Rules for every channel keep
 * RULE_CONTENT_CALL_MAX_LENGTH.
 */
export const CHANNEL_RULE_CONTENT_CALL_MAX_LENGTH = 8_000;

// Migration 0204 titles the rules it makes from the old instructions with
// these, in the business's default language. Keep the two in step: a test
// reads the migration.
const CHANNEL_RULE_TITLES: Record<RuntimeLocale, Record<RuleChannel, string>> = {
  en: { voice: "On calls", sms: "In texts", web_chat: "In website chat", instagram: "On Instagram" },
  fr: { voice: "Pendant les appels", sms: "Par texto", web_chat: "Dans le chat du site", instagram: "Sur Instagram" },
  es: { voice: "En las llamadas", sms: "Por SMS", web_chat: "En el chat del sitio web", instagram: "En Instagram" },
  sr: { voice: "U pozivima", sms: "U SMS porukama", web_chat: "U četu na sajtu", instagram: "Na Instagramu" },
  de: { voice: "Bei Anrufen", sms: "Per SMS", web_chat: "Im Website-Chat", instagram: "Auf Instagram" },
  pt: { voice: "Nas ligações", sms: "Por SMS", web_chat: "No chat do site", instagram: "No Instagram" },
  it: { voice: "Nelle chiamate", sms: "Via SMS", web_chat: "Nella chat del sito", instagram: "Su Instagram" },
  nl: { voice: "Bij gesprekken", sms: "Via sms", web_chat: "In de websitechat", instagram: "Op Instagram" },
  pl: { voice: "Podczas rozmów", sms: "W SMS-ach", web_chat: "W czacie na stronie", instagram: "Na Instagramie" },
  tr: { voice: "Aramalarda", sms: "SMS'lerde", web_chat: "Web sitesi sohbetinde", instagram: "Instagram'da" },
  vi: { voice: "Trong cuộc gọi", sms: "Trong tin nhắn SMS", web_chat: "Trong khung chat trên website", instagram: "Trên Instagram" },
  tl: { voice: "Sa mga tawag", sms: "Sa mga text", web_chat: "Sa chat ng website", instagram: "Sa Instagram" },
  sv: { voice: "I samtal", sms: "I sms", web_chat: "I webbchatten", instagram: "På Instagram" },
  ru: { voice: "Во время звонков", sms: "В SMS", web_chat: "В чате на сайте", instagram: "В Instagram" },
  uk: { voice: "Під час дзвінків", sms: "В SMS", web_chat: "У чаті на сайті", instagram: "В Instagram" },
};

/** The title a rule kept to one channel gets when code adds it for the business, in the business's language. */
export function channelRuleTitle(channel: RuleChannel, locale: RuntimeLocale): string {
  return (CHANNEL_RULE_TITLES[locale] ?? CHANNEL_RULE_TITLES.en)[channel];
}

/** Every locale's titles, for the migration's test. */
export function channelRuleTitles(): Readonly<Record<RuntimeLocale, Readonly<Record<RuleChannel, string>>>> {
  return CHANNEL_RULE_TITLES;
}
