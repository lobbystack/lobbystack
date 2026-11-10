import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { canVisitOnboardingStage, HOST_EMAIL_BRAND, normalizeInterfaceLocale, normalizeOnboardingStage, onboardingSteps, type InterfaceLocale, type OnboardingBusiness, type OnboardingStage, type PartnerAccessLevel } from "@lobbystack/shared";

import { businesses, enqueueOutbox, onboardingNumberClaimEvents, phoneNumbers, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { requireBusinessAdmin } from "../authz";
import { appBaseUrl } from "./appBaseUrl";
import type { DomainContext } from "./context";
import { attributeBusiness } from "./affiliates";
import { businessShowsOnBrand, readBusinessAccess, type BrandScope } from "./businessAccess";
import { businessGetsHostEmails } from "./hostEmails";
import { readActiveBusinessIdInTransaction } from "./tenancy";
import { greetingName } from "./emailGreeting";

export { canVisitOnboardingStage, isOnboardingStage, normalizeOnboardingStage, onboardingSteps, resolveOnboardingRoute, type OnboardingBusiness, type OnboardingStage } from "@lobbystack/shared";

/**
 * What the owner wants their agent to do first, as they answered at the goal
 * step. Each is something the product does today. Stored on the business, sent
 * to telemetry, and read by the new-account Home, so keep the values stable.
 * The businesses_onboarding_goal_valid check constraint lists them too.
 */
export const ONBOARDING_GOALS = ["answer_calls", "book_appointments", "answer_website_visitors", "answer_instagram_messages"] as const;
export type OnboardingGoal = (typeof ONBOARDING_GOALS)[number];

export function isOnboardingGoal(value: unknown): value is OnboardingGoal {
  return (ONBOARDING_GOALS as readonly unknown[]).includes(value);
}

// Owners give us their site first, set up their phone next and hear their agent
// last. Verifying a phone leads to the number step, or straight to the goal
// question when the business's country has no numbers yet or the owner skips
// the number. Someone with no website answers the language question on the way.
const transitions: Record<OnboardingStage, readonly OnboardingStage[]> = {
  create_business: ["website"],
  website: ["language", "verify_phone"],
  language: ["verify_phone"],
  verify_phone: ["phone_number", "goal"],
  phone_number: ["goal"],
  phone_number_claiming: ["phone_number", "goal"],
  goal: ["attribution"],
  attribution: ["meet"],
  meet: ["complete"],
  complete: [],
};

// A partner's business has no number step, goal or attribution: the partner
// gives it its numbers, and the host asks its owner neither question. The
// owner still verifies their phone, because calls forward to it, then meets
// their agent. At the activity level the partner sets the agent up, so the
// phone finishes onboarding.
const partnerTransitions: Record<OnboardingStage, readonly OnboardingStage[]> = {
  ...transitions,
  verify_phone: ["meet"],
  phone_number: ["meet"],
  phone_number_claiming: ["meet"],
  goal: ["meet"],
  attribution: ["meet"],
};
const activityTransitions: Record<OnboardingStage, readonly OnboardingStage[]> = {
  ...partnerTransitions,
  verify_phone: ["complete"],
  phone_number: ["complete"],
  phone_number_claiming: ["complete"],
  goal: ["complete"],
  attribution: ["complete"],
};

/**
 * The stages at which the dashboard claims a business a new number, as
 * app.reserve_trial_number_claim does: from the number step on. A partner's
 * business has no number step, so its claims wait for its owner's onboarding.
 */
export const NUMBER_CLAIM_STAGES: readonly OnboardingStage[] = ["phone_number", "goal", "attribution", "meet", "complete"];

/**
 * The stage a new business starts at, since creating it is done: its
 * website, or its owner's phone for an activity-only partner business.
 */
export function firstOnboardingStage(business: OnboardingBusiness): OnboardingStage {
  return onboardingSteps(business).find((stage) => stage !== "create_business")!;
}

export function isValidOnboardingTransition(from: OnboardingStage, to: OnboardingStage, business: { partnerId: string | null; accessLevel?: PartnerAccessLevel | undefined } = { partnerId: null }): boolean {
  const allowed = !business.partnerId ? transitions : business.accessLevel === "activity" ? activityTransitions : partnerTransitions;
  return allowed[from].includes(to);
}

// Prefer a membership the user can operate; fall back to the first active one.
export function selectPreferredMembership<T extends { role: string }>(rows: readonly T[]): T | undefined {
  return rows.find((row) => row.role !== "viewer") ?? rows[0];
}

/** Where the person stands in onboarding: the business, its stage, and the stages its owner goes through. */
export type OnboardingState = { businessId: string | null; stage: OnboardingStage; steps: readonly OnboardingStage[] };

// Null for a business the person can't open on this brand's domains.
async function onboardingStateForBusiness(
  tx: DatabaseTransaction,
  input: { userId: string; businessId: string },
  brand: BrandScope,
): Promise<OnboardingState | null> {
  const { businessId } = input;
  await tx.execute(sql`select set_config('app.business_id', ${businessId}, true)`);
  const business = (await tx.select({ onboardingStage: businesses.onboardingStage, partnerId: businesses.partnerId, accessLevel: businesses.partnerAccessLevel }).from(businesses).where(eq(businesses.id, businessId)).limit(1))[0];
  if (!business || !businessShowsOnBrand(business.partnerId, brand)) return null;
  // Onboarding is the owner's. A partner member who opened the business goes straight to its dashboard.
  if ((await readBusinessAccess(tx, input))?.via === "partner") return { businessId, stage: "complete", steps: [] };
  return { businessId, stage: normalizeOnboardingStage(business.onboardingStage), steps: onboardingSteps({ partnerId: business.partnerId, accessLevel: business.accessLevel }) };
}

/**
 * Where the person stands in onboarding on this brand's domains: the business
 * they work in there, its stage and the stages its owner goes through, or
 * create_business when they have no business there. A partner's businesses
 * count only on that partner's domains, and direct businesses only on the
 * host's.
 */
export async function getActiveOnboardingState(
  db: Database,
  userId: string,
  brand: BrandScope,
): Promise<OnboardingState> {
  return await withBusinessTransaction(db, { userId, actorType: "operator" }, async (tx) => {
    const activeBusinessId = await readActiveBusinessIdInTransaction(tx, { userId, brand });
    if (activeBusinessId) {
      const active = await onboardingStateForBusiness(tx, { userId, businessId: activeBusinessId }, brand);
      if (active) return active;
    }
    // The stored active business is missing, belongs to another brand, or its
    // membership is no longer active (for example, removed after the legacy
    // import), or the partner open that reached it expired. Fall back to an
    // active membership, then an open, so onboarding still resolves a stage
    // instead of dead-ending on create_business and looping on the first step.
    const memberships = (await tx.execute<{ business_id: string; role: string; partner_id: string | null; access_via: string }>(sql`select business_id, role, partner_id, access_via from app.list_user_businesses(${userId})`)).rows.filter((row) => businessShowsOnBrand(row.partner_id, brand));
    const preferred = selectPreferredMembership(memberships.filter((row) => row.access_via === "membership")) ?? selectPreferredMembership(memberships);
    if (preferred) {
      const fallback = await onboardingStateForBusiness(tx, { userId, businessId: String(preferred.business_id) }, brand);
      if (fallback) return fallback;
    }
    return { businessId: null, stage: "create_business", steps: onboardingSteps(null) };
  });
}

export async function advanceOnboardingStageInTransaction(
  tx: DatabaseTransaction,
  input: { userId: string; businessId: string; from: OnboardingStage; to: OnboardingStage; partnerId?: string | null; accessLevel?: PartnerAccessLevel | undefined },
): Promise<void> {
  await requireBusinessAdmin(tx, input);
  await moveOnboardingStageInTransaction(tx, input);
}

/** Moves a business to the next onboarding stage. The caller has already checked who may do that. */
export async function moveOnboardingStageInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; from: OnboardingStage; to: OnboardingStage; partnerId?: string | null; accessLevel?: PartnerAccessLevel | undefined },
): Promise<void> {
  if (!isValidOnboardingTransition(input.from, input.to, { partnerId: input.partnerId ?? null, accessLevel: input.accessLevel })) {
    throw new Error(`Invalid onboarding transition from ${input.from} to ${input.to}.`);
  }
  const changed = await tx.update(businesses)
    .set({ onboardingStage: input.to, updatedAt: new Date() })
    .where(and(eq(businesses.id, input.businessId), eq(businesses.onboardingStage, input.from)))
    .returning({ id: businesses.id });
  if (!changed.length) {
    const error = new Error("The onboarding step is no longer current.") as Error & { status: number; code: string };
    error.status = 409;
    error.code = "onboarding_stage_conflict";
    throw error;
  }
}

export async function advanceOnboardingStage(
  context: DomainContext,
  input: { userId: string; businessId: string; to: OnboardingStage },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const current = (await tx.select({ onboardingStage: businesses.onboardingStage, partnerId: businesses.partnerId, accessLevel: businesses.partnerAccessLevel }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1).for("update"))[0];
    if (!current) throw new Error("Business onboarding state was not found.");
    const currentStage = normalizeOnboardingStage(current.onboardingStage);
    // Repair a legacy verification stage before reading or advancing it so the
    // conditional stage write below still matches the persisted value.
    if (currentStage !== current.onboardingStage) {
      await tx.update(businesses)
        .set({ onboardingStage: currentStage, updatedAt: new Date() })
        .where(and(eq(businesses.id, input.businessId), eq(businesses.onboardingStage, current.onboardingStage)));
    }
    // Revisiting an earlier form must never move durable onboarding progress backwards.
    if (canVisitOnboardingStage(currentStage, input.to)) return;
    await advanceOnboardingStageInTransaction(tx, { ...input, from: currentStage, partnerId: current.partnerId, accessLevel: current.accessLevel });
    // Meet your agent is the last screen, so leaving it sends the welcome email.
    if (input.to === "complete") await scheduleWelcomeEmailInTransaction(tx, input.businessId, new Date());
  });
}

/**
 * Saves the owner's goal and moves on to attribution. Skipping sends no goal
 * and keeps any saved one. A partner's business has no goal step, so this
 * refuses it. Revisiting the step from a later stage leaves the stage alone.
 */
export async function submitOnboardingGoal(
  context: DomainContext,
  input: { userId: string; businessId: string; goal: OnboardingGoal | null },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const changed = await tx.update(businesses)
      .set({ ...(input.goal ? { onboardingGoal: input.goal } : {}), onboardingStage: sql`CASE WHEN ${businesses.onboardingStage} = 'goal' THEN 'attribution' ELSE ${businesses.onboardingStage} END`, updatedAt: new Date() })
      .where(and(eq(businesses.id, input.businessId), isNull(businesses.partnerId), inArray(businesses.onboardingStage, ["goal", "attribution", "meet", "complete"])))
      .returning({ id: businesses.id });
    if (!changed.length) {
      const error = new Error("The goal cannot be submitted at this onboarding stage.") as Error & { status: number; code: string };
      error.status = 409;
      error.code = "onboarding_stage_conflict";
      throw error;
    }
  });
}

export async function submitOnboardingAttribution(
  context: DomainContext,
  input: { userId: string; businessId: string; source?: string | null; referralCode?: string | null },
): Promise<void> {
  if (input.referralCode) {
    // Attribute before the stage moves to complete, so a retry after a failed
    // attribution still finds the "attribution" stage. Only that onboarding step
    // attributes, so a finished business cannot be credited to a new referrer.
    const stage = await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
      await requireBusinessAdmin(tx, input);
      return (await tx.select({ onboardingStage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1))[0]?.onboardingStage;
    });
    // The operator transaction above proved business administration. Attribution
    // runs separately as the system actor because the referrer's profile is not
    // visible under the referred operator's RLS context. It is idempotent, so a
    // retried submission cannot double count.
    if (stage === "attribution") {
      await attributeBusiness(context, { businessId: input.businessId, referredUserId: input.userId, referralCode: input.referralCode, source: "referral_link" });
    }
  }
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    // Skipping sends no source and keeps a saved one, and coming back from Meet your agent leaves the stage alone.
    const source = input.source?.trim().slice(0, 120) || null;
    const changed = await tx.update(businesses)
      .set({ ...(source ? { onboardingAttribution: source } : {}), onboardingStage: sql`CASE WHEN ${businesses.onboardingStage} = 'attribution' THEN 'meet' ELSE ${businesses.onboardingStage} END`, updatedAt: new Date() })
      .where(and(eq(businesses.id, input.businessId), inArray(businesses.onboardingStage, ["attribution", "meet", "complete"])))
      .returning({ id: businesses.id });
    if (!changed.length) {
      const error = new Error("Attribution cannot be submitted at this onboarding stage.") as Error & { status: number; code: string };
      error.status = 409;
      error.code = "onboarding_stage_conflict";
      throw error;
    }
  });
}

/** The answer saved at the attribution step, so coming back to it shows what was picked. */
export async function readOnboardingAttribution(context: DomainContext, input: { userId: string; businessId: string }): Promise<string | null> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    return (await tx.select({ source: businesses.onboardingAttribution }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1))[0]?.source ?? null;
  });
}

/** Schedules the welcome email for when onboarding finishes. A partner's business never gets it. */
export async function scheduleWelcomeEmailInTransaction(tx: DatabaseTransaction, businessId: string, completedAt: Date): Promise<void> {
  if (!await businessGetsHostEmails(tx, businessId)) return;
  // The dedupe key keeps a revisited last step from sending a second welcome.
  await enqueueOutbox(tx, {
    topic: "onboarding.sendWelcome",
    businessId,
    aggregateType: "business",
    aggregateId: businessId,
    dedupeKey: `onboarding-welcome:${businessId}`,
    availableAt: completedAt,
    payload: {},
  });
}

/** How long the welcome waits for a number still being set up before it goes out without one. */
const WELCOME_NUMBER_WAIT_MS = 15 * 60_000;
/** How soon the worker looks again while it waits. */
const WELCOME_RETRY_MS = 30_000;

export type WelcomeEmailResult = { status: "queued" | "skipped" } | { status: "waiting"; retryAt: Date };

const WELCOME_SUBJECTS: Record<InterfaceLocale, (firstName: string) => string> = {
  en: (name) => (name ? `Welcome to LobbyStack, ${name}` : "Welcome to LobbyStack"),
  fr: (name) => (name ? `Bienvenue chez LobbyStack, ${name}` : "Bienvenue chez LobbyStack"),
  es: (name) => (name ? `Le damos la bienvenida a LobbyStack, ${name}` : "Le damos la bienvenida a LobbyStack"),
  sr: (name) => (name ? `Dobro došli u LobbyStack, ${name}` : "Dobro došli u LobbyStack"),
};

/** Where the welcome email's button lands: Home, with the phone step open on its forwarding steps or its number picker. */
function welcomeUrl(): string {
  return `${appBaseUrl()}/?setup=phoneNumber`;
}

/**
 * Queues the welcome email to the owner of a business that just finished
 * onboarding, in their dashboard language. Its steps follow what they told
 * onboarding: the goal they picked, and the number they took, if any. While a
 * number they claimed is still being set up, it waits for it, so the email
 * names it, for up to 15 minutes after the claim.
 */
export async function queueWelcomeEmail(context: DomainContext, input: { businessId: string; now?: Date }): Promise<WelcomeEmailResult> {
  const now = input.now ?? new Date();
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx): Promise<WelcomeEmailResult> => {
    if (!await businessGetsHostEmails(tx, input.businessId)) return { status: "skipped" };
    const result = await tx.execute<{ user_id: string; email: string; name: string | null; preferred_locale: string; business_name: string }>(
      sql`select user_id, email, name, preferred_locale, business_name from app.resolve_onboarding_welcome_recipient(${input.businessId}::uuid)`,
    );
    const recipient = result.rows[0];
    if (!recipient) return { status: "skipped" };
    const [business] = await tx.select({ goal: businesses.onboardingGoal }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
    const [number] = await tx.select({ e164: phoneNumbers.e164 }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"))).orderBy(phoneNumbers.createdAt).limit(1);
    if (!number) {
      const [claim] = await tx.select({ id: onboardingNumberClaimEvents.id }).from(onboardingNumberClaimEvents)
        .where(and(eq(onboardingNumberClaimEvents.businessId, input.businessId), inArray(onboardingNumberClaimEvents.status, ["reserved", "provisioning"]), gt(onboardingNumberClaimEvents.reservedAt, new Date(now.getTime() - WELCOME_NUMBER_WAIT_MS)))).limit(1);
      if (claim) return { status: "waiting", retryAt: new Date(now.getTime() + WELCOME_RETRY_MS) };
    }
    const locale = normalizeInterfaceLocale(recipient.preferred_locale) ?? "en";
    const firstName = greetingName(recipient.name, recipient.email);
    await enqueueOutbox(tx, {
      topic: "email.send",
      businessId: input.businessId,
      aggregateType: "business",
      aggregateId: input.businessId,
      dedupeKey: `onboarding-welcome:${input.businessId}:email`,
      payload: {
        template: "welcome",
        to: recipient.email,
        subject: WELCOME_SUBJECTS[locale](firstName),
        variables: { locale, firstName, businessName: recipient.business_name, goal: isOnboardingGoal(business?.goal) ? business.goal : "", number: number?.e164 ?? "", url: welcomeUrl() },
        brand: HOST_EMAIL_BRAND,
        replyTo: null,
      },
    });
    return { status: "queued" };
  });
}
