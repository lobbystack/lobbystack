import { formatPhoneNumberDisplay } from "./phone";

/** Channels a contact can use to reach the business, in display order. */
export const CONTACT_CHANNELS = ["phone_call", "web_call", "sms", "web_chat"] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

/** Every channel the dashboard can label, including where staff or integrations booked. */
export type DisplayChannel = ContactChannel | "dashboard" | "api";

type Translate = (key: string) => string;

/**
 * Stored channel values grouped by meaning. Calls store `transport`
 * (`voice`, `web_voice`, `webrtc` and plain `web` on older calls,
 * `twilio_media_stream` from the retired voice gateway, `sip`, and `phone` or
 * `pstn` from older imports);
 * conversations, messages, and appointment sources store `voice`, `sms`,
 * `web_chat`, `web_voice`, `dashboard`, `operator`, or `api`.
 */
const CHANNEL_ALIASES: Record<string, DisplayChannel> = {
  voice: "phone_call",
  phone: "phone_call",
  pstn: "phone_call",
  // Phone calls from the retired voice gateway, and SIP trunk calls.
  twilio_media_stream: "phone_call",
  sip: "phone_call",
  phone_call: "phone_call",
  web: "web_call",
  web_voice: "web_call",
  web_call: "web_call",
  sms: "sms",
  web_chat: "web_chat",
  widget: "web_chat",
  dashboard: "dashboard",
  operator: "dashboard",
  api: "api",
};

const CHANNEL_LABEL_KEYS: Record<DisplayChannel, string> = {
  phone_call: "common:channels.phoneCall",
  web_call: "common:channels.webCall",
  sms: "common:channels.sms",
  web_chat: "common:channels.webChat",
  dashboard: "common:channels.dashboard",
  api: "common:channels.api",
};

export function normalizeChannel(value: string | null | undefined): DisplayChannel | null {
  const key = value?.trim().toLowerCase();
  if (!key) return null;
  // Any other transport containing "web" is a browser call, matching
  // voiceChannelForTransport in packages/domain/src/server/voice.ts.
  return CHANNEL_ALIASES[key] ?? (key.includes("web") ? "web_call" : null);
}

/** A readable label for any stored channel or source value. Unknown values are humanized, never shown as raw slugs. */
export function getChannelLabel(value: string | null | undefined, t: Translate): string {
  const channel = normalizeChannel(value);
  if (channel) return t(CHANNEL_LABEL_KEYS[channel]);
  const text = value?.trim().replace(/[_:-]+/g, " ").replace(/\s+/g, " ") ?? "";
  return text ? text[0]!.toUpperCase() + text.slice(1).toLowerCase() : "";
}

/** The distinct contact channels among stored values, in a stable display order. */
export function getContactChannels(values: ReadonlyArray<string | null | undefined> | null | undefined): ContactChannel[] {
  const found = new Set((values ?? []).map(normalizeChannel));
  return CONTACT_CHANNELS.filter((channel) => found.has(channel));
}

/**
 * Stored phone values are E.164 numbers, but older rows can hold placeholders
 * such as `unknown`, `anonymous`, or an anonymized `deleted-…` marker.
 */
export function hasDisplayablePhone(value: string | null | undefined): value is string {
  return /^\+?\d[\d\s().-]{2,}$/.test(value?.trim() ?? "");
}

export type ContactIdentity = {
  name?: string | null | undefined;
  phone?: string | null | undefined;
  email?: string | null | undefined;
  /** Stored channel values for this contact or the record being shown. */
  channels?: ReadonlyArray<string | null | undefined> | null | undefined;
};

/**
 * The name to show for a contact: the saved name, then the formatted phone
 * number, then the email, then a label for how they reached the business.
 */
export function getContactDisplayName(contact: ContactIdentity, locale: string, t: Translate): string {
  const name = contact.name?.trim();
  if (name) return name;
  if (hasDisplayablePhone(contact.phone)) return formatPhoneNumberDisplay(contact.phone, locale);
  const email = contact.email?.trim();
  if (email) return email;
  const channels = getContactChannels(contact.channels);
  if (channels.includes("web_chat")) return t("common:contactFallback.websiteVisitor");
  if (channels.includes("web_call")) return t("common:contactFallback.webCaller");
  if (channels.includes("phone_call")) return t("common:contactFallback.phoneCaller");
  return t("common:contactFallback.unknown");
}

/** Phone and email details that the display name does not already show. */
export function getContactSecondaryDetails(contact: ContactIdentity, locale: string): string[] {
  const details: string[] = [];
  const hasName = Boolean(contact.name?.trim());
  const phone = hasDisplayablePhone(contact.phone) ? formatPhoneNumberDisplay(contact.phone, locale) : null;
  if (phone && hasName) details.push(phone);
  const email = contact.email?.trim();
  if (email && (hasName || phone)) details.push(email);
  return details;
}
