import { and, eq, sql } from "drizzle-orm";

import { affiliateAttributions, affiliateProfileStats, affiliateProfiles, businesses, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { requireBusinessAdmin } from "../authz";
import type { DomainContext } from "./context";
import { normalizeAffiliateReferralCode } from "./affiliates";

export type OnboardingStage =
  | "create_business"
  | "website"
  | "knowledge"
  | "greeting"
  | "verify_phone"
  | "verify_phone_code"
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
  verify_phone: "/onboarding/verify-phone",
  verify_phone_code: "/onboarding/verify-phone/code",
  plan: "/onboarding/plan",
  phone_number: "/onboarding/number",
  phone_number_claiming: "/onboarding/number",
  attribution: "/onboarding/attribution",
  complete: "/",
};

const transitions: Record<OnboardingStage, readonly OnboardingStage[]> = {
  create_business: ["website"],
  website: ["knowledge"],
  knowledge: ["greeting"],
  greeting: ["verify_phone"],
  verify_phone: ["verify_phone_code"],
  verify_phone_code: ["plan"],
  plan: ["phone_number", "attribution"],
  phone_number: ["attribution"],
  phone_number_claiming: ["phone_number", "attribution"],
  attribution: ["complete"],
  complete: [],
};

export function resolveOnboardingRoute(stage: string | null | undefined): string {
  return stageRoutes[(stage ?? "create_business") as OnboardingStage] ?? stageRoutes.create_business;
}

export function isOnboardingStage(value: unknown): value is OnboardingStage {
  return typeof value === "string" && value in stageRoutes;
}

export function isValidOnboardingTransition(from: OnboardingStage, to: OnboardingStage): boolean {
  return transitions[from].includes(to);
}

export async function getActiveOnboardingState(
  db: Database,
  userId: string,
): Promise<{ businessId: string | null; stage: OnboardingStage }> {
  return await withBusinessTransaction(db, { userId, actorType: "operator" }, async (tx) => {
    const user = (await tx.select({ activeBusinessId: users.activeBusinessId }).from(users).where(eq(users.id, userId)).limit(1))[0];
    if (!user?.activeBusinessId) return { businessId: null, stage: "create_business" };
    await tx.execute(sql`select set_config('app.business_id', ${user.activeBusinessId}, true)`);
    const business = (await tx.select({ onboardingStage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, user.activeBusinessId)).limit(1))[0];
    return {
      businessId: user.activeBusinessId,
      stage: isOnboardingStage(business?.onboardingStage) ? business.onboardingStage : "create_business",
    };
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
    const current = (await tx.select({ onboardingStage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1))[0];
    if (!current || !isOnboardingStage(current.onboardingStage)) throw new Error("Business onboarding state was not found.");
    await advanceOnboardingStageInTransaction(tx, { ...input, from: current.onboardingStage });
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
      .where(and(eq(businesses.id, input.businessId), eq(businesses.onboardingStage, "attribution")))
      .returning({ id: businesses.id });
    if (!changed.length) {
      const error = new Error("Attribution cannot be submitted at this onboarding stage.") as Error & { status: number; code: string };
      error.status = 409;
      error.code = "onboarding_stage_conflict";
      throw error;
    }
  });
}
