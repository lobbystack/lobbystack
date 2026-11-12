import { and, eq, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { HOST_EMAIL_BRAND, normalizeInterfaceLocale } from "@lobbystack/shared";

import { businesses, enqueueOutbox, numberTrials, phoneNumbers, platformKeyBusinesses, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";

import { appBaseUrl } from "./appBaseUrl";
import type { DomainContext } from "./context";
import { greetingName } from "./emailGreeting";
import { loadEntitlement } from "./entitlement";
import { businessGetsHostEmails } from "./hostEmails";

// The plan reminder: one email to the owner of a direct cloud business that
// claimed a trial number, met its agent, and left the plans without choosing.
// The plans are its last onboarding step, so it has had no welcome yet.

/** How long after the plans open the reminder waits. */
const PLAN_REMINDER_DELAY_MS = 60 * 60_000;
/** The local hours it never goes out in: from 21:00 until 08:00. */
const QUIET_FROM_HOUR = 21;
const QUIET_UNTIL_HOUR = 8;
/** When a reminder due in those hours goes out instead, local time. */
const MORNING_HOUR = 9;

/**
 * When the reminder goes out: an hour after the business reached the plans,
 * or at 09:00 in its time zone when that hour lands between 21:00 and 08:00.
 * An unknown time zone counts as UTC.
 */
export function planReminderDueAt(enteredAt: Date, timezone: string): Date {
  const instant = new Date(enteredAt.getTime() + PLAN_REMINDER_DELAY_MS);
  const zoned = DateTime.fromJSDate(instant).setZone(timezone);
  const local = zoned.isValid ? zoned : DateTime.fromJSDate(instant, { zone: "utc" });
  if (local.hour >= QUIET_UNTIL_HOUR && local.hour < QUIET_FROM_HOUR) return local.toJSDate();
  // Late evening waits for tomorrow morning; the small hours wait for this morning.
  const day = local.hour >= QUIET_FROM_HOUR ? local.plus({ days: 1 }) : local;
  return day.set({ hour: MORNING_HOUR, minute: 0, second: 0, millisecond: 0 }).toJSDate();
}

/**
 * The reminder job's dedupe key. A business reaches the plans once, and the
 * outbox keeps this job's row when it prunes, so the key holds for good. The
 * email the job queues keeps its own key, `onboarding-plan-reminder:{businessId}:email`.
 */
export function planReminderDedupeKey(businessId: string): string {
  return `onboarding-plan-reminder:${businessId}`;
}

/**
 * Whether the business may get the plan reminder: a direct cloud business
 * that set itself up. A partner's business, a self-hosted one, and one a
 * platform key onboarded never do, as with the welcome email.
 */
async function getsPlanReminderInTransaction(tx: DatabaseTransaction, businessId: string): Promise<{ timezone: string } | null> {
  if (!await businessGetsHostEmails(tx, businessId)) return null;
  const [business] = await tx.select({ deploymentMode: businesses.deploymentMode, timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business || business.deploymentMode !== "cloud") return null;
  const [platformKey] = await tx.select({ businessId: platformKeyBusinesses.businessId }).from(platformKeyBusinesses).where(eq(platformKeyBusinesses.businessId, businessId)).limit(1);
  return platformKey ? null : { timezone: business.timezone };
}

/** Schedules the plan reminder when a business reaches the plans, due by planReminderDueAt. */
export async function schedulePlanReminderInTransaction(tx: DatabaseTransaction, businessId: string, enteredAt: Date): Promise<void> {
  const business = await getsPlanReminderInTransaction(tx, businessId);
  if (!business) return;
  await enqueueOutbox(tx, {
    topic: "onboarding.sendPlanReminder",
    businessId,
    aggregateType: "business",
    aggregateId: businessId,
    dedupeKey: planReminderDedupeKey(businessId),
    availableAt: planReminderDueAt(enteredAt, business.timezone),
    payload: {},
  });
}

export type PlanReminderResult = { status: "queued" | "skipped" };

/** Where the reminder's button lands: the plans, the last onboarding step. */
function planReminderUrl(): string {
  return `${appBaseUrl()}/onboarding/plan`;
}

/**
 * Queues the plan reminder to the business's owner, in their dashboard
 * language, when it's due. It checks again that the business is still on the
 * plans, with its trial running on its number and no paid plan, and skips
 * otherwise.
 */
export async function queuePlanReminderEmail(context: DomainContext, input: { businessId: string }): Promise<PlanReminderResult> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx): Promise<PlanReminderResult> => {
    if (!await getsPlanReminderInTransaction(tx, input.businessId)) return { status: "skipped" };
    const [business] = await tx.select({ stage: businesses.onboardingStage, status: businesses.status }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
    if (business?.stage !== "choose_plan" || business.status !== "active") return { status: "skipped" };
    const [trial] = await tx.select({ e164: phoneNumbers.e164 }).from(numberTrials)
      .innerJoin(phoneNumbers, eq(phoneNumbers.id, numberTrials.phoneNumberId))
      .where(and(eq(numberTrials.businessId, input.businessId), eq(numberTrials.status, "active"), eq(phoneNumbers.status, "active")))
      .limit(1);
    if (!trial) return { status: "skipped" };
    if ((await loadEntitlement(tx, input.businessId)).live) return { status: "skipped" };
    const owner = (await tx.execute<{ email: string; name: string | null; preferred_locale: string; business_name: string }>(sql`select email, name, preferred_locale, business_name from app.resolve_business_owner_contact(${input.businessId}::uuid)`)).rows[0];
    if (!owner) return { status: "skipped" };
    const locale = normalizeInterfaceLocale(owner.preferred_locale) ?? "en";
    // The template writes the subject and formats the number in it and the body.
    await enqueueOutbox(tx, {
      topic: "email.send",
      businessId: input.businessId,
      aggregateType: "business",
      aggregateId: input.businessId,
      dedupeKey: `${planReminderDedupeKey(input.businessId)}:email`,
      payload: {
        template: "plan_reminder",
        to: owner.email,
        variables: { locale, firstName: greetingName(owner.name, owner.email), businessName: owner.business_name, number: trial.e164, url: planReminderUrl() },
        brand: HOST_EMAIL_BRAND,
        replyTo: null,
      },
    });
    return { status: "queued" };
  });
}
