import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { createDatabaseClient } from "@lobbystack/db";
import { attachExternalNumber, detachExternalNumber } from "@lobbystack/domain";
import { z } from "zod";

/**
 * Gives a business a number LobbyStack doesn't hold at a carrier, such as a Zadarma
 * number whose calls reach the agent through the SIP server in docker/asterisk. The
 * business's agent answers calls whose SIP headers name the number. See
 * docs/voice/external-numbers.md.
 *
 * Dry-run is the default; pass --apply to change anything. --remove takes an external
 * number off the business again, and never touches a number a carrier holds.
 */

const optionsSchema = z.object({
  businessId: z.guid(),
  number: z.string().regex(/^\+[1-9]\d{7,14}$/, "Use E.164, for example +381211234567."),
  agentId: z.guid().optional(),
  remove: z.boolean().default(false),
  apply: z.boolean().default(false),
});

export function parseAttachExternalNumberArgs(argv: string[]) {
  const { values } = parseArgs({ args: argv, options: { "business-id": { type: "string" }, number: { type: "string" }, "agent-id": { type: "string" }, remove: { type: "boolean" }, apply: { type: "boolean" } } });
  return optionsSchema.parse({ businessId: values["business-id"], number: values.number, agentId: values["agent-id"], remove: values.remove ?? false, apply: values.apply ?? false });
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const options = parseAttachExternalNumberArgs(argv);
  if (options.remove && options.agentId) throw new Error("--agent-id only applies when attaching a number.");
  console.log(JSON.stringify({ action: options.remove ? "remove" : "attach", businessId: options.businessId, number: options.number, ...(options.agentId ? { agentId: options.agentId } : {}), apply: options.apply }));
  if (!options.apply) return;

  const database = createDatabaseClient("lobbystack_worker");
  try {
    const context = { db: database.db };
    if (options.remove) {
      console.log(JSON.stringify({ number: options.number, removed: await detachExternalNumber(context, { businessId: options.businessId, e164: options.number }) }));
      return;
    }
    const attached = await attachExternalNumber(context, { businessId: options.businessId, e164: options.number, ...(options.agentId ? { agentId: options.agentId } : {}) });
    console.log(JSON.stringify({ number: attached.e164, phoneNumberId: attached.phoneNumberId, agentId: attached.agentId, attached: attached.created ? "new" : "already attached" }));
  } finally {
    await database.pool.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
