import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { and, asc, eq, gt, isNull, lt, ne, or, sql } from "drizzle-orm";
import { createDatabaseClient, messages, storageObjects, transcripts, withBusinessTransaction, type Database } from "@lobbystack/db";
import { z } from "zod";
import { contentExpiryForPlan, contentRetentionDays, isContentRetentionEnabled, resolveBusinessBillingPlan } from "../packages/domain/src/server/contentRetentionPolicy";

const optionsSchema = z.object({
  businessId: z.string().uuid(),
  category: z.enum(["messages", "transcripts", "recordings"]),
  before: z.string().datetime({ offset: true }).transform((value) => new Date(value)),
  after: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  apply: z.boolean().default(false),
  historicalApprovalId: z.string().trim().min(1).max(200).optional(),
  historicalBasis: z.literal("created-at").optional(),
}).superRefine((value, ctx) => {
  if (value.before.getTime() > Date.now()) {
    ctx.addIssue({ code: "custom", message: "The historical cutoff must not be in the future." });
  }
  if (value.apply && (!value.historicalApprovalId || value.historicalBasis !== "created-at")) {
    ctx.addIssue({ code: "custom", message: "Apply requires historical approval and an explicit created-at basis." });
  }
});

export function parseContentRetentionArgs(args: string[]) {
  const { values } = parseArgs({ args, options: {
    "business-id": { type: "string" }, category: { type: "string" }, before: { type: "string" },
    after: { type: "string" }, limit: { type: "string" }, apply: { type: "boolean", default: false },
    "historical-approval-id": { type: "string" }, "historical-basis": { type: "string" },
  } });
  return optionsSchema.parse({ businessId: values["business-id"], category: values.category,
    before: values.before, after: values.after, limit: values.limit, apply: values.apply,
    historicalApprovalId: values["historical-approval-id"], historicalBasis: values["historical-basis"] });
}

export async function backfillContentRetention(db: Database, raw: z.input<typeof optionsSchema>) {
  const input = optionsSchema.parse(raw);
  if (!isContentRetentionEnabled()) throw new Error("Content retention is disabled.");
  return withBusinessTransaction(db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    // One bounded keyset page per invocation. Never load or print customer content.
    await tx.execute(sql`set local statement_timeout = '10s'`);
    await tx.execute(sql`set local lock_timeout = '2s'`);
    const now = new Date();
    let examined = 0;
    let updated = 0;
    let alreadyDue = 0;
    let cursor: string | null = input.after ?? null;

    if (input.category === "recordings") {
      // Recordings already carry a retention date, so only shorten the ones
      // longer than the plan allows. An existing shorter value is never extended.
      const plan = await resolveBusinessBillingPlan(tx, input.businessId);
      const days = contentRetentionDays(plan, "recordings");
      const candidates = await tx.select({ id: storageObjects.id, createdAt: storageObjects.createdAt }).from(storageObjects)
        .where(and(
          eq(storageObjects.businessId, input.businessId),
          eq(storageObjects.purpose, "recording"),
          ne(storageObjects.status, "deleted"),
          lt(storageObjects.createdAt, input.before),
          input.after ? gt(storageObjects.id, input.after) : undefined,
          or(
            isNull(storageObjects.retentionUntil),
            sql`${storageObjects.retentionUntil} > ${storageObjects.createdAt} + (${days} * interval '1 day')`,
          ),
        ))
        .orderBy(asc(storageObjects.id)).limit(input.limit);
      for (const row of candidates) {
        const expiry = contentExpiryForPlan(plan, "recordings", row.createdAt);
        examined += 1;
        if (expiry <= now) alreadyDue += 1;
        if (!input.apply) continue;
        const changed = await tx.update(storageObjects)
          .set({ retentionUntil: expiry, updatedAt: now })
          .where(and(
            eq(storageObjects.businessId, input.businessId),
            eq(storageObjects.id, row.id),
            eq(storageObjects.purpose, "recording"),
            ne(storageObjects.status, "deleted"),
            or(isNull(storageObjects.retentionUntil), sql`${storageObjects.retentionUntil} > ${expiry}`),
          ))
          .returning({ id: storageObjects.id });
        updated += changed.length;
      }
      cursor = candidates.at(-1)?.id ?? cursor;
      return { mode: input.apply ? "apply" : "dry-run", category: input.category, examined, updated, alreadyDue, nextCursor: cursor, pageFull: candidates.length === input.limit, before: input.before.toISOString() };
    }

    const table = input.category === "messages" ? messages : transcripts;
    const expiryColumn = input.category === "messages" ? messages.contentExpiresAt : transcripts.expiresAt;
    const candidates = await tx.select({ id: table.id, createdAt: table.createdAt }).from(table)
      .where(and(eq(table.businessId, input.businessId), isNull(expiryColumn), lt(table.createdAt, input.before),
        input.after ? gt(table.id, input.after) : undefined,
        input.category === "messages" ? ne(messages.body, "[content expired]") : undefined))
      .orderBy(asc(table.id)).limit(input.limit);
    // Expiry follows the business plan; the JSON policy only overrides paid defaults.
    const plan = await resolveBusinessBillingPlan(tx, input.businessId);
    for (const row of candidates) {
      const expiry = contentExpiryForPlan(plan, input.category, row.createdAt);
      examined += 1;
      if (expiry <= now) alreadyDue += 1;
      if (!input.apply) continue;
      const changed = input.category === "messages"
        ? await tx.update(messages).set({ contentExpiresAt: expiry }).where(and(eq(messages.businessId, input.businessId), eq(messages.id, row.id), isNull(messages.contentExpiresAt), ne(messages.body, "[content expired]"))).returning({ id: messages.id })
        : await tx.update(transcripts).set({ expiresAt: expiry }).where(and(eq(transcripts.businessId, input.businessId), eq(transcripts.id, row.id), isNull(transcripts.expiresAt))).returning({ id: transcripts.id });
      updated += changed.length;
    }
    cursor = candidates.at(-1)?.id ?? cursor;
    return { mode: input.apply ? "apply" : "dry-run", category: input.category, examined, updated, alreadyDue, nextCursor: cursor, pageFull: candidates.length === input.limit, before: input.before.toISOString() };
  });
}

async function main() {
  const input = parseContentRetentionArgs(process.argv.slice(2));
  if (!process.env.CONTENT_RETENTION_DATABASE_URL) throw new Error("CONTENT_RETENTION_DATABASE_URL is required.");
  const client = createDatabaseClient("lobbystack_worker", { DATABASE_URL: process.env.CONTENT_RETENTION_DATABASE_URL });
  try {
    const role = await client.pool.query<{ current_user: string }>("select current_user");
    if (role.rows[0]?.current_user !== "lobbystack_worker") throw new Error("Backfill requires the worker database role.");
    console.log(JSON.stringify(await backfillContentRetention(client.db, { ...input, before: input.before.toISOString() })));
  } finally {
    await client.pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // DB/validation errors can include credentials or input values.
    console.error("Content retention backfill failed; check arguments, approval configuration, and database access.");
    process.exitCode = 1;
  });
}
