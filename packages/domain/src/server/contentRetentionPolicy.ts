import { z } from "zod";

import type { DatabaseTransaction } from "@lobbystack/db";
import {
  contentRetentionDaysForPlan,
  type BillingPlanSlug,
  type ContentRetentionCategory,
  type ContentRetentionOverrides,
} from "@lobbystack/shared";

import { loadBillingContext } from "./usage";

const days = z.number().int().positive().max(365_000);
const policySchema = z.strictObject({
  approvalId: z.string().trim().min(1).max(200).optional(),
  categories: z.strictObject({
    messages: days.optional(),
    transcripts: days.optional(),
    recordings: days.optional(),
    follow_ups: days.optional(),
  }),
  messageMedia: z.literal("scrub_with_body").optional(),
});

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

// The plan usage limits enforce, so a canceled subscription also loses paid storage and retention.
export async function resolveBusinessBillingPlan(
  tx: DatabaseTransaction,
  businessId: string,
): Promise<BillingPlanSlug> {
  return (await loadBillingContext(tx, businessId)).plan;
}

export function contentRetentionDays(
  plan: BillingPlanSlug,
  category: ContentRetentionCategory,
  overrides: ContentRetentionOverrides | null = getContentRetentionPolicy()?.categories ?? null,
): number {
  return contentRetentionDaysForPlan(plan, category, overrides);
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
