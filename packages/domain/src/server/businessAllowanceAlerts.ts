import { and, eq, sql } from "drizzle-orm";

import { billingUsageEvents, billingUsageMonths, businesses, enqueueOutbox, type DatabaseTransaction } from "@lobbystack/db";
import { HOST_EMAIL_BRAND, intlLocale, normalizeInterfaceLocale, type EmailBrandReference, type Entitlement } from "@lobbystack/shared";

// Alerts at 80% and 100% of a partner's business's allowance, its minutes and
// its chats each. They go by email to the owners and admins of the business's
// own team, under the business's brand, which is its partner's, and to the
// partner's own owners and admins, under the host's brand, since the partner
// is the host's customer. Usage metering checks after each change to the
// month's final usage, under the business's usage lock. Each alert goes out
// once a month, and again only when the business moves to a package of
// another size, since its key names the allowance it measured. Like the
// business's dashboard, the emails carry no prices.

export type AllowanceAlertKind = "minutes" | "chats";

export type AllowanceAlert = {
  kind: AllowanceAlertKind;
  threshold: 80 | 100;
  /** What the month records it under, such as minutes:80:600. */
  key: string;
  /** The lower alert of the same kind, marked sent with this one so it never follows it. */
  covers: string[];
};

/** The month's usage that ended: the seconds of calls that ended and the chats. */
export type FinalUsage = { voiceSeconds: number; chats: number };

const THRESHOLDS = [80, 100] as const;
const KINDS: AllowanceAlertKind[] = ["minutes", "chats"];

// Seconds carry fractions, so rounding allows for float error.
const EPSILON = 1e-9;

/**
 * What an alert measures: the minutes of calls that ended, rounded up to
 * whole minutes, against the allowance's whole minutes, and chats against
 * its chats. Null when the allowance has no limit or none at all, as while
 * its partner's businesses are paused.
 */
function measure(allowance: Entitlement["allowance"], used: FinalUsage, kind: AllowanceAlertKind): { used: number; limit: number } | null {
  if (kind === "minutes") {
    const limit = allowance.voiceSeconds === null ? 0 : Math.floor(allowance.voiceSeconds / 60);
    return limit > 0 ? { used: Math.max(0, Math.ceil(used.voiceSeconds / 60 - EPSILON)), limit } : null;
  }
  return allowance.chats ? { used: Math.max(0, Math.round(used.chats)), limit: allowance.chats } : null;
}

function alertKey(allowance: Entitlement["allowance"], kind: AllowanceAlertKind, threshold: number): string {
  return `${kind}:${threshold}:${kind === "minutes" ? allowance.voiceSeconds : allowance.chats}`;
}

/**
 * The alerts the month's final usage makes due: for each kind, the highest
 * share it reached that the month hasn't sent. A month that reaches 100% at
 * once sends only the 100% alert.
 */
export function allowanceAlertsDue(allowance: Entitlement["allowance"], used: FinalUsage, sent: Record<string, unknown>): AllowanceAlert[] {
  return KINDS.flatMap((kind): AllowanceAlert[] => {
    const measured = measure(allowance, used, kind);
    if (!measured) return [];
    const reached = THRESHOLDS.filter((threshold) => measured.used * 100 >= threshold * measured.limit);
    const highest = reached.at(-1);
    if (highest === undefined) return [];
    const key = alertKey(allowance, kind, highest);
    if (sent[key]) return [];
    const covers = reached.slice(0, -1).map((threshold) => alertKey(allowance, kind, threshold)).filter((lower) => !sent[lower]);
    return [{ kind, threshold: highest, key, covers }];
  });
}

/** Someone an alert goes to: one of the business's owners and admins, or one of its partner's. */
type Recipient = { user_id: string; email: string; name: string | null; preferred_locale: string | null };

/** One person's copy of each alert: the email, the link it carries, and the brand it goes out under. */
type Delivery = { recipient: Recipient; template: "business_allowance_alert" | "partner_business_allowance_alert"; dedupe: string; url: string; brand: EmailBrandReference };

function appBaseUrl(): string {
  return (process.env.APP_BASE_URL?.trim() || "http://localhost").replace(/\/$/, "");
}

/** The business's Usage page. The worker moves the link onto the business's brand's domain when it sends the email. */
function usageUrl(): string {
  return `${appBaseUrl()}/settings/usage`;
}

/** The console's Businesses page, on the host's own domain, where the partner's owners and admins change a business's overage. */
function partnerBusinessesUrl(partnerId: string): string {
  return `${appBaseUrl()}/partner/${partnerId}/businesses`;
}

/** What one alert says to one person, in their language: the email template writes the rest, with the partner's name. */
function alertVariables(input: { periodKey: string; entitlement: Entitlement; used: FinalUsage; alert: AllowanceAlert; recipient: Recipient; businessName: string; url: string }): Record<string, string> {
  const { alert, recipient, entitlement } = input;
  const locale = normalizeInterfaceLocale(recipient.preferred_locale) ?? "en";
  const count = (value: number) => new Intl.NumberFormat(intlLocale(locale)).format(value);
  const measured = measure(entitlement.allowance, input.used, alert.kind) ?? { used: 0, limit: 0 };
  return {
    locale,
    firstName: recipient.name?.trim().split(/\s+/)[0] ?? "",
    businessName: input.businessName,
    kind: alert.kind,
    threshold: String(alert.threshold),
    used: count(measured.used),
    included: count(measured.limit),
    // Whether usage past the allowance keeps answering, and whether a monthly limit stops it.
    overage: entitlement.overage.enabled ? "on" : "off",
    capped: entitlement.overage.enabled && entitlement.overage.capMinor !== null ? "yes" : "",
    month: new Intl.DateTimeFormat(intlLocale(locale), { month: "long", timeZone: "UTC" }).format(new Date(`${input.periodKey}-01T00:00:00.000Z`)),
    url: input.url,
  };
}

/** The month's final minutes and chats, which the alerts measure: open calls count once they end. */
async function finalUsage(tx: DatabaseTransaction, input: { businessId: string; periodKey: string }): Promise<FinalUsage> {
  const rows = await tx.select({ usageKind: billingUsageEvents.usageKind, quantity: sql<number>`coalesce(sum(greatest(${billingUsageEvents.quantity}, 0)), 0)::double precision` })
    .from(billingUsageEvents)
    .where(and(eq(billingUsageEvents.businessId, input.businessId), eq(billingUsageEvents.periodKey, input.periodKey), eq(billingUsageEvents.isFinal, true), sql`${billingUsageEvents.usageKind} in ('voice_seconds', 'chat_ai_tokens')`))
    .groupBy(billingUsageEvents.usageKind);
  const of = (kind: string) => Number(rows.find((row) => row.usageKind === kind)?.quantity ?? 0);
  return { voiceSeconds: of("voice_seconds"), chats: of("chat_ai_tokens") };
}

/**
 * Queues the allowance alerts the month's final usage makes due, one email
 * per alert to each of the business's owners and admins and each of its
 * partner's, in the transaction that changed the usage. Only a live business
 * on a package gets them. The caller holds the business's usage lock and
 * saved the month's row, which records each alert sent. Returns the alerts
 * queued.
 */
export async function queueBusinessAllowanceAlertsInTransaction(tx: DatabaseTransaction, input: { businessId: string; periodKey: string; entitlement: Entitlement }): Promise<AllowanceAlert[]> {
  const { entitlement } = input;
  if (entitlement.source !== "package" || !entitlement.live) return [];
  const [month] = await tx.select({ alertsSent: billingUsageMonths.alertsSent }).from(billingUsageMonths).where(and(eq(billingUsageMonths.businessId, input.businessId), eq(billingUsageMonths.periodKey, input.periodKey))).limit(1);
  if (!month) return [];
  const used = await finalUsage(tx, input);
  const due = allowanceAlertsDue(entitlement.allowance, used, month.alertsSent);
  if (!due.length) return [];
  const queuedAt = new Date().toISOString();
  const marked = Object.fromEntries(due.flatMap((alert) => [alert.key, ...alert.covers]).map((key) => [key, queuedAt]));
  await tx.update(billingUsageMonths).set({ alertsSent: { ...month.alertsSent, ...marked }, updatedAt: new Date() }).where(and(eq(billingUsageMonths.businessId, input.businessId), eq(billingUsageMonths.periodKey, input.periodKey)));
  const [business] = await tx.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
  const businessName = business?.name ?? "";
  const team = (await tx.execute<Recipient>(sql`select user_id, email, name, preferred_locale from app.business_allowance_alert_recipients(${input.businessId}::uuid)`)).rows;
  // The business's brand is its partner's: it names the partner, and replies reach the partner's support.
  const deliveries: Delivery[] = team.map((recipient) => ({ recipient, template: "business_allowance_alert", dedupe: "business-allowance", url: usageUrl(), brand: { kind: "business", businessId: input.businessId } }));
  // The partner's owners and admins, who sell the business its package and set its overage. The host
  // writes to its own customer, whatever brand the partner shows its businesses.
  const partnerId = entitlement.poolPartnerId;
  if (partnerId) {
    const partnerPeople = (await tx.execute<Recipient>(sql`select user_id, email, name, preferred_locale from app.partner_pool_alert_recipients(${partnerId}::uuid, ${input.periodKey})`)).rows;
    deliveries.push(...partnerPeople.map((recipient): Delivery => ({ recipient, template: "partner_business_allowance_alert", dedupe: "partner-business-allowance", url: partnerBusinessesUrl(partnerId), brand: HOST_EMAIL_BRAND })));
  }
  for (const alert of due) {
    for (const delivery of deliveries) {
      await enqueueOutbox(tx, {
        topic: "email.send",
        businessId: input.businessId,
        aggregateType: "business",
        aggregateId: input.businessId,
        dedupeKey: `${delivery.dedupe}:${input.businessId}:${input.periodKey}:alert:${alert.key}:${delivery.recipient.user_id}`,
        payload: {
          template: delivery.template,
          to: delivery.recipient.email,
          variables: alertVariables({ periodKey: input.periodKey, entitlement, used, alert, recipient: delivery.recipient, businessName, url: delivery.url }),
          brand: delivery.brand,
          replyTo: null,
        },
      });
    }
  }
  return due;
}
