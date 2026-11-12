import { and, eq, sql } from "drizzle-orm";
import { HOST_EMAIL_BRAND, normalizeInterfaceLocale } from "@lobbystack/shared";

import { businesses, enqueueOutbox, numberTrials, phoneNumbers, platformKeyBusinesses, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";

import { appBaseUrl } from "./appBaseUrl";
import type { DomainContext } from "./context";
import { greetingName } from "./emailGreeting";
import { loadEntitlement } from "./entitlement";
import { businessGetsHostEmails } from "./hostEmails";
import { marketingEmailRecipient } from "./marketingEmails";

// The plan reminders: two emails to the owner of a direct cloud business that
// claimed a trial number, met its agent, and left the plans without choosing.
// The first goes an hour after it reached the plans, and the second and last
// a day after. The plans are its last onboarding step, so it has had no
// welcome yet.

export type PlanReminder = "first" | "second";

/** How long after the plans open each reminder waits. */
const PLAN_REMINDER_DELAY_MS: Record<PlanReminder, number> = { first: 60 * 60_000, second: 24 * 60 * 60_000 };

/** When a reminder goes out: an hour, or for the second a day, after the business reached the plans, at any hour. */
export function planReminderDueAt(enteredAt: Date, reminder: PlanReminder = "first"): Date {
  return new Date(enteredAt.getTime() + PLAN_REMINDER_DELAY_MS[reminder]);
}

/**
 * A reminder job's dedupe key. A business reaches the plans once, and the
 * outbox keeps these jobs' rows when it prunes, so each key holds for good.
 * The first keeps the key it had when it was the only reminder. The email a
 * job queues keeps its own key: this one followed by `:email`.
 */
export function planReminderDedupeKey(businessId: string, reminder: PlanReminder = "first"): string {
  return reminder === "first" ? `onboarding-plan-reminder:${businessId}` : `onboarding-plan-reminder:${businessId}:second`;
}

/** Which reminder a job's payload names; one queued before the second existed names none and is the first. */
export function planReminderOf(payload: Record<string, unknown>): PlanReminder {
  return payload.reminder === "second" ? "second" : "first";
}

/**
 * Whether the business may get the plan reminders: a direct cloud business
 * that set itself up. A partner's business, a self-hosted one, and one a
 * platform key onboarded never do, as with the welcome email.
 */
async function getsPlanReminderInTransaction(tx: DatabaseTransaction, businessId: string): Promise<boolean> {
  if (!await businessGetsHostEmails(tx, businessId)) return false;
  const [business] = await tx.select({ deploymentMode: businesses.deploymentMode }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business || business.deploymentMode !== "cloud") return false;
  const [platformKey] = await tx.select({ businessId: platformKeyBusinesses.businessId }).from(platformKeyBusinesses).where(eq(platformKeyBusinesses.businessId, businessId)).limit(1);
  return !platformKey;
}

/**
 * Schedules both plan reminders when a business reaches the plans, due by
 * planReminderDueAt. A worker on the previous release that takes the second
 * job queues the first email again, which its dedupe key drops.
 */
export async function schedulePlanReminderInTransaction(tx: DatabaseTransaction, businessId: string, enteredAt: Date): Promise<void> {
  if (!await getsPlanReminderInTransaction(tx, businessId)) return;
  for (const reminder of ["first", "second"] as const) {
    await enqueueOutbox(tx, {
      topic: "onboarding.sendPlanReminder",
      businessId,
      aggregateType: "business",
      aggregateId: businessId,
      dedupeKey: planReminderDedupeKey(businessId, reminder),
      availableAt: planReminderDueAt(enteredAt, reminder),
      payload: reminder === "first" ? {} : { reminder },
    });
  }
}

export type PlanReminderResult = { status: "queued" | "skipped" };

/** Where the reminder's button lands: the plans, the last onboarding step. */
function planReminderUrl(): string {
  return `${appBaseUrl()}/onboarding/plan`;
}

/**
 * Queues a plan reminder to the business's owner, in their dashboard
 * language, when it's due. It checks again that the business is still on the
 * plans, with its trial running on its number and no paid plan, and skips
 * otherwise.
 */
export async function queuePlanReminderEmail(context: DomainContext, input: { businessId: string; reminder?: PlanReminder }): Promise<PlanReminderResult> {
  const reminder = input.reminder ?? "first";
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
    // An owner who unsubscribed from marketing emails gets no reminder. The worker checks again as it sends it.
    if ((await marketingEmailRecipient(tx, owner.email))?.unsubscribed) return { status: "skipped" };
    const locale = normalizeInterfaceLocale(owner.preferred_locale) ?? "en";
    // The template writes the subject and formats the number in it and the body.
    await enqueueOutbox(tx, {
      topic: "email.send",
      businessId: input.businessId,
      aggregateType: "business",
      aggregateId: input.businessId,
      dedupeKey: `${planReminderDedupeKey(input.businessId, reminder)}:email`,
      payload: {
        // Both reminders use one template, so a worker on the previous release sends the second as the first.
        template: "plan_reminder",
        to: owner.email,
        variables: { locale, firstName: greetingName(owner.name, owner.email), businessName: owner.business_name, number: trial.e164, url: planReminderUrl(), ...(reminder === "second" ? { kind: "second" } : {}) },
        brand: HOST_EMAIL_BRAND,
        replyTo: null,
      },
    });
    return { status: "queued" };
  });
}
