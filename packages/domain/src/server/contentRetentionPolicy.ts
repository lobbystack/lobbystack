import { eq } from "drizzle-orm";
import { z } from "zod";

import { billingAccounts, businesses, type DatabaseTransaction } from "@lobbystack/db";
import {
  billingPlanSlugs,
  contentRetentionDaysForPlan,
  type BillingPlanSlug,
  type ContentRetentionCategory,
  type ContentRetentionOverrides,
} from "@lobbystack/shared";

const days = z.number().int().positive().max(365_000);
const policySchema = z.object({
  approvalId: z.string().trim().min(1).max(200).optional(),
  categories: z.object({
    messages: days.optional(),
    transcripts: days.optional(),
    recordings: days.optional(),
    follow_ups: days.optional(),
  }).strict(),
  messageMedia: z.literal("scrub_with_body").optional(),
}).strict();

export type ContentRetentionPolicy = z.infer<typeof policySchema>;
export type { ContentRetentionCategory };

// Content retention is on by default. `CONTENT_RETENTION_ENABLED=false` is the
// only escape hatch that disables it deployment-wide.
export function isContentRetentionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CONTENT_RETENTION_ENABLED !== "false";
}

// Optional per-category day override for the paid defaults. Free stays capped at
// 30 days regardless. Missing or malformed configuration yields no override.
export function getContentRetentionPolicy(env: NodeJS.ProcessEnv = process.env): ContentRetentionPolicy | null {
  if (!env.CONTENT_RETENTION_POLICY_JSON) return null;
  try {
    const parsed = policySchema.safeParse(JSON.parse(env.CONTENT_RETENTION_POLICY_JSON));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function billingPlanForAccount(
  accountPlan: string | null | undefined,
  deploymentMode: string | null | undefined,
): BillingPlanSlug {
  if (accountPlan && (billingPlanSlugs as readonly string[]).includes(accountPlan)) return accountPlan as BillingPlanSlug;
  return deploymentMode === "self_hosted_standard" ? "self_host" : "free_cloud";
}

export async function resolveBusinessBillingPlan(
  tx: DatabaseTransaction,
  businessId: string,
): Promise<BillingPlanSlug> {
  const [account] = await tx.select({ plan: billingAccounts.plan }).from(billingAccounts).where(eq(billingAccounts.businessId, businessId)).limit(1);
  if (account?.plan && (billingPlanSlugs as readonly string[]).includes(account.plan)) return account.plan as BillingPlanSlug;
  const [business] = await tx.select({ deploymentMode: businesses.deploymentMode }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  return billingPlanForAccount(null, business?.deploymentMode);
}

export function contentExpiryForPlan(
  plan: BillingPlanSlug,
  category: ContentRetentionCategory,
  createdAt = new Date(),
  overrides: ContentRetentionOverrides | null = getContentRetentionPolicy()?.categories ?? null,
): Date {
  const duration = contentRetentionDaysForPlan(plan, category, overrides);
  const expiry = new Date(createdAt.getTime() + duration * 86_400_000);
  if (!Number.isFinite(expiry.getTime())) throw new Error("Invalid content retention timestamp.");
  return expiry;
}
