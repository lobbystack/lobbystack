import { z } from "zod";

const days = z.number().int().positive().max(365_000);
const policySchema = z.object({
  approvalId: z.string().trim().min(1).max(200),
  categories: z.object({ messages: days.optional(), transcripts: days.optional() }).strict(),
  messageMedia: z.literal("scrub_with_body"),
}).strict();

export type ContentRetentionPolicy = z.infer<typeof policySchema>;
export type ContentRetentionCategory = keyof ContentRetentionPolicy["categories"];

// Missing or malformed configuration fails closed; there are no default periods.
export function getContentRetentionPolicy(env: NodeJS.ProcessEnv = process.env): ContentRetentionPolicy | null {
  if (env.CONTENT_RETENTION_ENABLED !== "true" || !env.CONTENT_RETENTION_POLICY_JSON) return null;
  try {
    const parsed = policySchema.safeParse(JSON.parse(env.CONTENT_RETENTION_POLICY_JSON));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function contentExpiry(
  category: ContentRetentionCategory,
  createdAt = new Date(),
  policy = getContentRetentionPolicy(),
): Date | null {
  const duration = policy?.categories[category];
  if (duration === undefined) return null;
  const expiry = new Date(createdAt.getTime() + duration * 86_400_000);
  if (!Number.isFinite(expiry.getTime())) throw new Error("Invalid content retention timestamp.");
  return expiry;
}
