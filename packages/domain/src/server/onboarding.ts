import { and, eq, inArray, sql } from "drizzle-orm";

import { affiliateAttributions, affiliateProfileStats, affiliateProfiles, billingAccounts, businesses, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { requireBusinessAdmin } from "../authz";
import type { DomainContext } from "./context";
import { normalizeAffiliateReferralCode } from "./affiliates";

export type OnboardingStage =
  | "create_business"
  | "website"
  | "knowledge"
  | "greeting"
  | "plan"
  | "phone_number"
  | "phone_number_claiming"
  | "attribution"
  | "complete";

const stageRoutes: Record<OnboardingStage, string> = {
  create_business: "/onboarding/business",
  website: "/onboarding/website",
  knowledge: "/onboarding/knowledge",
  greeting: "/onboarding/greeting",
  plan: "/onboarding/plan",
  phone_number: "/onboarding/number",
  phone_number_claiming: "/onboarding/number",
  attribution: "/onboarding/attribution",
  complete: "/",
};

const stageSteps: Record<OnboardingStage, number> = {
  create_business: 2,
  website: 3,
  knowledge: 4,
  greeting: 5,
  plan: 6,
  phone_number: 7,
  phone_number_claiming: 7,
  attribution: 8,
  complete: 9,
};

const transitions: Record<OnboardingStage, readonly OnboardingStage[]> = {
  create_business: ["website"],
  website: ["knowledge"],
  knowledge: ["greeting"],
  greeting: ["plan"],
  plan: ["phone_number", "attribution"],
  phone_number: ["attribution"],
  phone_number_claiming: ["phone_number", "attribution"],
  attribution: ["complete"],
  complete: [],
};

// Personal phone verification was removed from onboarding. Workspaces parked on
// a verification stage before the removal normalize forward to plan so they
// resume instead of looping on a step that no longer exists.
const legacyVerificationStages = new Set(["verify_phone", "verify_phone_code"]);

export function isOnboardingStage(value: unknown): value is OnboardingStage {
  return typeof value === "string" && Object.hasOwn(stageRoutes, value);
}

export function normalizeOnboardingStage(value: unknown): OnboardingStage {
  if (isOnboardingStage(value)) return value;
  if (typeof value === "string" && legacyVerificationStages.has(value)) return "plan";
  return "create_business";
}

export function resolveOnboardingRoute(stage: string | null | undefined): string {
  return stageRoutes[normalizeOnboardingStage(stage ?? "create_business")];
}

export function resolveOnboardingStageForPlan(stage: OnboardingStage, plan: string | null): OnboardingStage {
  return (stage === "phone_number" || stage === "phone_number_claiming") && plan === "free_cloud" ? "plan" : stage;
}

export function isValidOnboardingTransition(from: OnboardingStage, to: OnboardingStage): boolean {
  return transitions[from].includes(to);
}

export function canVisitOnboardingStage(current: OnboardingStage, target: OnboardingStage): boolean {
  return stageSteps[target] <= stageSteps[current];
}

// Prefer a membership the user can operate; fall back to the first active one.
export function selectPreferredMembership<T extends { role: string }>(rows: readonly T[]): T | undefined {
  return rows.find((row) => row.role !== "viewer") ?? rows[0];
}

async function onboardingStateForBusiness(
  tx: DatabaseTransaction,
  businessId: string,
): Promise<{ businessId: string; stage: OnboardingStage } | null> {
  await tx.execute(sql`select set_config('app.business_id', ${businessId}, true)`);
  const business = (await tx.select({ onboardingStage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, businessId)).limit(1))[0];
  if (!business) return null;
  const billing = (await tx.select({ plan: billingAccounts.plan }).from(billingAccounts).where(eq(billingAccounts.businessId, businessId)).limit(1))[0];
  return {
    businessId,
    stage: resolveOnboardingStageForPlan(normalizeOnboardingStage(business.onboardingStage), billing?.plan ?? null),
  };
}

export async function getActiveOnboardingState(
  db: Database,
  userId: string,
): Promise<{ businessId: string | null; stage: OnboardingStage }> {
  return await withBusinessTransaction(db, { userId, actorType: "operator" }, async (tx) => {
    const user = (await tx.select({ activeBusinessId: users.activeBusinessId }).from(users).where(eq(users.id, userId)).limit(1))[0];
    if (user?.activeBusinessId) {
      const active = await onboardingStateForBusiness(tx, user.activeBusinessId);
      if (active) return active;
    }
    // The stored active business is missing, or its membership is no longer
    // active (for example, removed after the legacy import). Fall back to an
    // active membership so onboarding still resolves a stage instead of
    // dead-ending on create_business and looping on the first step.
    const memberships = await tx.execute<{ business_id: string; role: string }>(sql`select business_id, role from app.list_user_businesses(${userId})`);
    const preferred = selectPreferredMembership(memberships.rows ?? []);
    if (preferred) {
      const fallback = await onboardingStateForBusiness(tx, String(preferred.business_id));
      if (fallback) return fallback;
    }
    return { businessId: null, stage: "create_business" };
  });
}

export async function advanceOnboardingStageInTransaction(
  tx: DatabaseTransaction,
  input: { userId: string; businessId: string; from: OnboardingStage; to: OnboardingStage },
): Promise<void> {
  await requireBusinessAdmin(tx, input);
  if (!isValidOnboardingTransition(input.from, input.to)) {
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
    const current = (await tx.select({ onboardingStage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1).for("update"))[0];
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
    await advanceOnboardingStageInTransaction(tx, { ...input, from: currentStage });
  });
}

export async function submitOnboardingAttribution(
  context: DomainContext,
  input: { userId: string; businessId: string; source?: string | null; referralCode?: string | null },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const referralCode = normalizeAffiliateReferralCode(input.referralCode ?? "");
    if (referralCode) {
      const profile = (await tx.select({ id: affiliateProfiles.id, userId: affiliateProfiles.userId }).from(affiliateProfiles).where(and(eq(affiliateProfiles.referralCode, referralCode), eq(affiliateProfiles.status, "active"))).limit(1))[0];
      if (profile && profile.userId !== input.userId) {
        const [attribution] = await tx.insert(affiliateAttributions).values({ affiliateProfileId: profile.id, businessId: input.businessId, referredUserId: input.userId, referralCode, source: "referral_link" }).onConflictDoNothing().returning({ id: affiliateAttributions.id });
        if (attribution) {
          await tx.insert(affiliateProfileStats).values({ affiliateProfileId: profile.id, referralCount: 1 }).onConflictDoUpdate({ target: affiliateProfileStats.affiliateProfileId, set: { referralCount: sql`${affiliateProfileStats.referralCount} + 1`, updatedAt: new Date() } });
        }
      }
    }
    const changed = await tx.update(businesses)
      .set({ onboardingAttribution: input.source?.trim().slice(0, 120) || null, onboardingStage: "complete", updatedAt: new Date() })
      .where(and(eq(businesses.id, input.businessId), inArray(businesses.onboardingStage, ["attribution", "complete"])))
      .returning({ id: businesses.id });
    if (!changed.length) {
      const error = new Error("Attribution cannot be submitted at this onboarding stage.") as Error & { status: number; code: string };
      error.status = 409;
      error.code = "onboarding_stage_conflict";
      throw error;
    }
  });
}
