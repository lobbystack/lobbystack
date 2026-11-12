import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { eq } from "drizzle-orm";

// Turns AI text replies on or off for one business. Only the host runs this,
// with the database's credentials. The live terms must allow AI replies before
// anyone uses --on: see docs/specs/ai-sms-replies.md.

function printUsage(): void {
  console.log(`Usage:
  pnpm text-replies:set --business <business id> --on
  pnpm text-replies:set --business <business id> --off

  --business  The business's id.
  --on        The agent answers texts to the business's own number.
  --off       It stops, including replies already queued.

A cloud business's texts to US numbers stay blocked either way until the
business is registered. This command needs no Business Number or EIN.

Required env:
  DATABASE_URL
`);
}

export type TextRepliesCommand = { kind: "usage"; exitCode: 0 | 1 } | { kind: "set"; businessId: string; enabled: boolean };

export function parseTextRepliesArgs(args: string[]): TextRepliesCommand {
  const { values } = parseArgs({ args, options: { business: { type: "string" }, on: { type: "boolean" }, off: { type: "boolean" }, help: { type: "boolean" } }, strict: false });
  if (values.help) return { kind: "usage", exitCode: 0 };
  if (typeof values.business !== "string" || !values.business || Boolean(values.on) === Boolean(values.off)) return { kind: "usage", exitCode: 1 };
  return { kind: "set", businessId: values.business, enabled: Boolean(values.on) };
}

async function main(): Promise<void> {
  const command = parseTextRepliesArgs(process.argv.slice(2));
  if (command.kind === "usage") {
    printUsage();
    process.exitCode = command.exitCode;
    return;
  }
  const { auditLogs, businesses, createDatabaseClient } = await import("@lobbystack/db");
  const client = createDatabaseClient("lobbystack_migrator");
  try {
    const changed = await client.db.transaction(async (tx) => {
      const rows = await tx.update(businesses).set({ textRepliesEnabled: command.enabled, updatedAt: new Date() }).where(eq(businesses.id, command.businessId)).returning({ id: businesses.id, name: businesses.name });
      if (rows[0]) await tx.insert(auditLogs).values({ businessId: rows[0].id, actorUserId: null, eventType: command.enabled ? "text_replies.enabled" : "text_replies.disabled", entityType: "business", entityId: rows[0].id, payload: {} });
      return rows[0];
    });
    if (!changed) throw new Error(`No business has the id ${command.businessId}.`);
    console.log(`AI text replies are ${command.enabled ? "on" : "off"} for ${changed.name}.`);
  } finally {
    await client.pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
