import type { TFunction } from "i18next";
import { AtSign, CalendarClock, CalendarX2, Clock, CreditCard, Gauge, Globe, Hourglass, Phone, PhoneForwarded, PhoneOff, Sparkles, UserPlus, Webhook, type LucideIcon } from "lucide-react";
import { intlLocale, type BusinessNotificationItem, type BusinessNotificationKind, type ProductUpdateCopy } from "@lobbystack/shared";

/** Each kind's icon. */
export const NOTIFICATION_ICONS: Record<BusinessNotificationKind, LucideIcon> = {
  trial_ending: Clock,
  trial_ended: Hourglass,
  trial_minutes_used_up: Gauge,
  number_released: PhoneOff,
  payment_failed: CreditCard,
  plan_canceled: CalendarX2,
  minutes_80: Gauge,
  minutes_100: Gauge,
  number_purchase_failed: Phone,
  number_release_soon: PhoneOff,
  calendar_sync_failing: CalendarClock,
  instagram_reconnect: AtSign,
  webhook_failing: Webhook,
  website_import_failed: Globe,
  website_import_finished: Globe,
  forwarding_detected: PhoneForwarded,
  invite_accepted: UserPlus,
  product_update: Sparkles,
};

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);
const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/** A product update's copy in the reader's language, or English. */
export function productUpdateCopy(params: Record<string, unknown>, language: string): ProductUpdateCopy | null {
  const copy = params.copy as Partial<Record<string, ProductUpdateCopy>> | undefined;
  const base = language.split("-")[0] ?? "en";
  return copy?.[base] ?? copy?.en ?? null;
}

/** Where an item opens: a dashboard path, or for a product update without one, its changelog entry in the reader's language. */
export function notificationHref(item: Pick<BusinessNotificationItem, "kind" | "href" | "params">, language: string): string | null {
  if (item.href) return item.href;
  if (item.kind === "product_update") return productUpdateCopy(item.params, language)?.href ?? null;
  return null;
}

/** An item's title and line in the reader's language, from its kind and params. */
export function notificationCopy(item: Pick<BusinessNotificationItem, "kind" | "params">, t: TFunction, language: string): { title: string; line: string } {
  const p = item.params;
  const k = (key: string, values: Record<string, unknown> = {}) => t(`notifications.kinds.${item.kind}.${key}`, values) as string;
  const date = (value: unknown) => {
    const parsed = typeof value === "string" ? new Date(value) : null;
    return parsed && !Number.isNaN(parsed.getTime()) ? new Intl.DateTimeFormat(intlLocale(language), { dateStyle: "medium" }).format(parsed) : "";
  };
  const number = (value: unknown) => new Intl.NumberFormat(intlLocale(language)).format(count(value));
  switch (item.kind) {
    case "trial_ending":
      return { title: k("title", { count: count(p.days) || 1 }), line: k("line") };
    case "number_released":
      return { title: k("title", { number: text(p.number) ?? "" }), line: k(p.trial ? "lineTrial" : "line") };
    case "plan_canceled":
      return { title: k("title", { date: date(p.endsAt) }), line: k("line") };
    case "minutes_80":
    case "minutes_100":
      return { title: k("title"), line: k("line", { used: number(p.used), included: number(p.included) }) };
    case "number_purchase_failed":
      return { title: text(p.number) ? k("title", { number: p.number }) : k("titleNoNumber"), line: k(p.unavailable ? "lineUnavailable" : "line") };
    case "number_release_soon":
      return { title: k("title", { number: text(p.number) ?? "", date: date(p.releaseAt) }), line: k("line") };
    case "calendar_sync_failing": {
      const provider = text(p.provider);
      const name = t(`notifications.providers.${provider && ["google", "calcom", "calendly"].includes(provider) ? provider : "other"}`) as string;
      return { title: k("title", { provider: name }), line: k("line") };
    }
    case "instagram_reconnect":
      return { title: k("title"), line: text(p.username) ? k("line", { username: p.username }) : k("lineNoUsername") };
    case "webhook_failing":
      return { title: k("title"), line: k("line", { host: text(p.host) ?? "" }) };
    case "website_import_failed":
      return { title: k("title", { site: text(p.site) ?? "" }), line: k("line") };
    case "website_import_finished":
      return { title: k("title"), line: k("line", { count: count(p.pages), site: text(p.site) ?? "" }) };
    case "forwarding_detected":
      return { title: k("title"), line: k("line", { from: text(p.from) ?? "" }) };
    case "invite_accepted":
      return { title: k("title", { email: text(p.email) ?? "" }), line: k("line") };
    case "product_update": {
      const copy = productUpdateCopy(p, language);
      return { title: copy?.title ?? "", line: copy?.description ?? "" };
    }
    default:
      return { title: k("title"), line: k("line") };
  }
}
