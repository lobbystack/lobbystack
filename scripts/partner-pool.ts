import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import type { PartnerHostPool } from "@lobbystack/domain";

// Sets or clears a partner's pool on a deployment that bills partners no
// tier: the voice minutes and website chats its businesses share each month.
// Unset means no limit. Nothing prices overage without tier billing, so the
// businesses stop at the pool. Only the host runs this, with the database's
// credentials; the partner's console shows the pool but can't change it.

function printUsage(): void {
  console.log(`Usage:
  pnpm partner-pool:set --partner acme --minutes 500 --chats 2000
  pnpm partner-pool:set --partner acme --clear

  --partner  The partner's id, its subdomain (acme, or acme.receptionistportal.com), or its own verified domain.
  --minutes  The voice minutes the partner's businesses share each month. Leave it out to keep the current limit.
  --chats    The website chats they share each month. Leave it out to keep the current limit.
  --clear    Remove both limits.

For deployments without the POLAR_PARTNER_* tier products. While you sell
tiers, each partner's tier sets its pool, so the command refuses a limit when
this shell has those products set or the worker last started with them.

The pool applies from the next call or chat. Nothing bills overage without
tier billing, so at the pool the businesses' calls forward and their website
chat stops replying until the month starts over. The partner's owners and
admins get an email at 80% and at 100% of it, and owners see this month's use
on the console's Billing page.

Required env:
  DATABASE_URL or LOBBYSTACK_APP_DATABASE_URL
`);
}

export type PartnerPoolCommand =
  | { kind: "usage"; exitCode: 0 | 1 }
  | { kind: "set"; partner: string; voiceMinutes?: number; chats?: number }
  | { kind: "clear"; partner: string };

function wholeNumber(flag: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value.trim())) throw new Error(`${flag} must be a whole number, such as 500.`);
  return Number(value.trim());
}

/** Reads the command line. A kind left out keeps the limit it has. */
export function parsePartnerPoolCommand(args: string[]): PartnerPoolCommand {
  const { values } = parseArgs({
    args,
    strict: true,
    options: {
      partner: { type: "string" },
      minutes: { type: "string" },
      chats: { type: "string" },
      clear: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) return { kind: "usage", exitCode: 0 };
  const partner = values.partner?.trim();
  if (!partner) return { kind: "usage", exitCode: 1 };
  const voiceMinutes = wholeNumber("--minutes", values.minutes);
  const chats = wholeNumber("--chats", values.chats);
  if (values.clear) {
    if (voiceMinutes !== undefined || chats !== undefined) throw new Error("--clear removes both limits. Leave out --minutes and --chats.");
    return { kind: "clear", partner };
  }
  if (voiceMinutes === undefined && chats === undefined) return { kind: "usage", exitCode: 1 };
  return { kind: "set", partner, ...(voiceMinutes !== undefined ? { voiceMinutes } : {}), ...(chats !== undefined ? { chats } : {}) };
}

/** What the command prints about the partner's pool now. */
export function describePartnerPool(result: PartnerHostPool): string[] {
  const count = (value: number) => new Intl.NumberFormat("en-US").format(value);
  const { voiceSeconds, chats } = result.pool;
  const heading = `${result.name} (${result.slug}, ${result.partnerId})`;
  if (voiceSeconds === null && chats === null) return [`${heading} has no pool limit now.`];
  return [
    `${heading} shares this pool across its businesses each month:`,
    `  Minutes: ${voiceSeconds === null ? "no limit" : count(Math.floor(voiceSeconds / 60))}`,
    `  Chats: ${chats === null ? "no limit" : count(chats)}`,
    "At the pool, their calls forward and their website chat stops replying until the month starts over.",
  ];
}

async function main(): Promise<void> {
  const command = parsePartnerPoolCommand(process.argv.slice(2));
  if (command.kind === "usage") {
    printUsage();
    process.exitCode = command.exitCode;
    return;
  }
  const [{ createDatabaseClient }, { setPartnerHostPool }] = await Promise.all([import("@lobbystack/db"), import("@lobbystack/domain")]);
  const app = createDatabaseClient("lobbystack_app");
  try {
    const result = await setPartnerHostPool({ db: app.db }, command.kind === "clear" ? { partner: command.partner, clear: true } : command);
    for (const line of describePartnerPool(result)) console.log(line);
  } finally {
    await app.pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
