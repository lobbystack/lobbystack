import { sql } from "drizzle-orm";

import { enqueueOutbox, type DatabaseTransaction } from "@lobbystack/db";
import { HOST_EMAIL_BRAND, intlLocale, normalizeInterfaceLocale, partnerTierCatalog } from "@lobbystack/shared";

import type { PoolChange, PoolMonth, PoolState } from "./partnerPool";

// Alerts at 80% and 100% of a partner's pool, minutes and chats each, and of
// its overage cap. They go to the partner's owners and admins by email, under
// the host's brand: the partner is the host's customer. Usage metering checks
// after each change to the pool's counts, under the pool's lock. Each alert
// goes out once a month, and again only when the pool or the cap it measured
// changes size, since its key names that size. A pool the host set, on a
// deployment that bills no tiers, alerts the same way at its own size.

export type PoolAlertKind = "minutes" | "chats" | "cap";

/**
 * The aggregate a pool alert's email is queued under, with the partner's id.
 * The email rides in the outbox of the business whose usage crossed the
 * share, but it's about the partner, so deleting that business keeps it.
 */
export const POOL_ALERT_AGGREGATE = "partner";

export type PoolAlert = {
  kind: PoolAlertKind;
  threshold: 80 | 100;
  /** What the month records it under, such as minutes:80:15000. */
  key: string;
  /** The lower alert of the same kind, marked sent with this one so it never follows it. */
  covers: string[];
};

const THRESHOLDS = [80, 100] as const;
const KINDS: PoolAlertKind[] = ["minutes", "chats", "cap"];

// Spend carries fractions of a cent, so rounding allows for float error.
const EPSILON = 1e-9;

/** The month's counts once a change applies. */
function monthAfter(month: PoolMonth, change: PoolChange): PoolMonth {
  return {
    ...month,
    voiceSecondsUsed: month.voiceSecondsUsed + change.voiceSeconds,
    voiceSecondsFinal: month.voiceSecondsFinal + change.voiceSecondsFinal,
    chatsUsed: month.chatsUsed + change.chats,
    overageVoiceSeconds: month.overageVoiceSeconds + change.overageVoiceSeconds,
    overageChats: month.overageChats + change.overageChats,
    overageSpendCents: month.overageSpendCents + change.overageSpendCents,
  };
}

/**
 * What an alert measures, rounded as the console's Billing page rounds it:
 * minutes of calls that ended against the pool's whole minutes, chats
 * against its chats, and overage cents against the cap. Null when nothing
 * limits it: no tier billing and no pool the host set, overage off or
 * unbilled, or no cap.
 */
function measure(terms: PoolState["terms"], month: PoolMonth, kind: PoolAlertKind): { used: number; limit: number } | null {
  if (kind === "minutes") return terms.voiceSeconds ? { used: Math.max(0, Math.ceil(month.voiceSecondsFinal / 60 - EPSILON)), limit: Math.floor(terms.voiceSeconds / 60) } : null;
  if (kind === "chats") return terms.chats ? { used: Math.max(0, Math.round(month.chatsUsed)), limit: terms.chats } : null;
  const cap = terms.overage.capCents;
  return terms.overage.enabled && cap !== null && cap > 0 ? { used: Math.max(0, Math.ceil(month.overageSpendCents - EPSILON)), limit: cap } : null;
}

function alertKey(terms: PoolState["terms"], kind: PoolAlertKind, threshold: number): string {
  const size = kind === "minutes" ? terms.voiceSeconds : kind === "chats" ? terms.chats : terms.overage.capCents;
  return `${kind}:${threshold}:${size}`;
}

/**
 * The alerts a change makes due: for each kind, the highest share it reached
 * that the month hasn't sent. A month that reaches 100% at once sends only
 * the 100% alert.
 */
export function poolAlertsDue(state: PoolState, change: PoolChange): PoolAlert[] {
  const month = monthAfter(state.month, change);
  return KINDS.flatMap((kind): PoolAlert[] => {
    const measured = measure(state.terms, month, kind);
    if (!measured || measured.limit <= 0) return [];
    const reached = THRESHOLDS.filter((threshold) => measured.used * 100 >= threshold * measured.limit);
    const highest = reached.at(-1);
    if (highest === undefined) return [];
    const key = alertKey(state.terms, kind, highest);
    if (state.month.alertsSent[key]) return [];
    const covers = reached.slice(0, -1).map((threshold) => alertKey(state.terms, kind, threshold)).filter((lower) => !state.month.alertsSent[lower]);
    return [{ kind, threshold: highest, key, covers }];
  });
}

type Recipient = { user_id: string; email: string; name: string | null; preferred_locale: string | null; partner_name: string };

/** The console's Billing page, on the host's own domain, where an owner changes the tier or the overage. */
function billingUrl(partnerId: string): string {
  return `${(process.env.APP_BASE_URL?.trim() || "http://localhost").replace(/\/$/, "")}/partner/${partnerId}/billing`;
}

/** What one alert says to one person, in their language: the email template writes the rest. */
function alertVariables(state: PoolState, month: PoolMonth, alert: PoolAlert, recipient: Recipient): Record<string, string> {
  const locale = normalizeInterfaceLocale(recipient.preferred_locale) ?? "en";
  const count = (value: number) => new Intl.NumberFormat(intlLocale(locale)).format(value);
  const money = (cents: number) => new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: "USD" }).format(cents / 100);
  const measured = measure(state.terms, month, alert.kind) ?? { used: 0, limit: 0 };
  const { overage } = state.terms;
  return {
    locale,
    firstName: recipient.name?.trim().split(/\s+/)[0] ?? "",
    partnerName: recipient.partner_name,
    kind: alert.kind,
    threshold: String(alert.threshold),
    used: alert.kind === "cap" ? money(measured.used) : count(measured.used),
    included: alert.kind === "cap" ? money(measured.limit) : count(measured.limit),
    // Who set the pool: the tier, or the host on a deployment that bills no tiers, where the partner can't pick a tier.
    pool: state.terms.source === "host" ? "host" : "tier",
    // Whether usage past the pool keeps answering: on, off by the owner's switch, or none on a tier or a host's pool without overage.
    overage: overage.enabled ? "on" : state.terms.source === "tier" && partnerTierCatalog[state.terms.tier].overagesBillable ? "off" : "none",
    cap: overage.enabled && overage.capCents !== null ? money(overage.capCents) : "",
    month: new Intl.DateTimeFormat(intlLocale(locale), { month: "long", timeZone: "UTC" }).format(new Date(`${state.periodKey}-01T00:00:00.000Z`)),
    url: billingUrl(state.partnerId),
  };
}

/**
 * Queues the alerts a change to the pool makes due, one email per alert to
 * each of the partner's owners and admins, in the transaction that moved the
 * counts. The caller holds the pool's lock, inside one of the partner's
 * businesses, whose outbox carries the emails. Returns the alerts queued.
 */
export async function queuePartnerPoolAlertsInTransaction(tx: DatabaseTransaction, input: { businessId: string; pool: PoolState; change: PoolChange }): Promise<PoolAlert[]> {
  const { pool } = input;
  const due = poolAlertsDue(pool, input.change);
  if (!due.length) return [];
  const keys = due.flatMap((alert) => [alert.key, ...alert.covers]);
  const claimed = (await tx.execute<{ claimed: string[] | null }>(sql`select app.claim_partner_pool_alerts(${pool.partnerId}::uuid, ${pool.periodKey}, ${`{${keys.map((key) => `"${key}"`).join(",")}}`}::text[]) as claimed`)).rows[0]?.claimed ?? [];
  const sending = due.filter((alert) => claimed.includes(alert.key));
  if (!sending.length) return [];
  const recipients = (await tx.execute<Recipient>(sql`select user_id, email, name, preferred_locale, partner_name from app.partner_pool_alert_recipients(${pool.partnerId}::uuid, ${pool.periodKey})`)).rows;
  const month = monthAfter(pool.month, input.change);
  for (const alert of sending) {
    for (const recipient of recipients) {
      await enqueueOutbox(tx, {
        topic: "email.send",
        businessId: input.businessId,
        aggregateType: POOL_ALERT_AGGREGATE,
        aggregateId: pool.partnerId,
        dedupeKey: `partner-pool:${pool.partnerId}:${pool.periodKey}:alert:${alert.key}:${recipient.user_id}`,
        payload: {
          template: "partner_pool_alert",
          to: recipient.email,
          variables: alertVariables(pool, month, alert, recipient),
          // The host writes to its own customer, whatever brand the partner shows its businesses.
          brand: HOST_EMAIL_BRAND,
          replyTo: null,
        },
      });
    }
  }
  return sending;
}
