import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { adviseZadarma, checkZadarma } from "@lobbystack/providers/zadarma/zadarmaCheck";
import { ZadarmaClient } from "@lobbystack/providers/zadarma/zadarmaClient";

/**
 * Reads the Zadarma account and says whether LobbyStack can sell numbers from it. It orders and changes nothing.
 *
 *   pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/operations/zadarma-check.ts [--country RS]
 *
 * It signs real requests with ZADARMA_API_KEY and ZADARMA_API_SECRET, so a "Wrong signature" answer means the
 * keys or the signing are wrong. It lists the account's numbers, its documents groups (the id of the one to use is
 * ZADARMA_DOCUMENTS_GROUP_ID), and whether each group suits the country's landline destinations.
 * See docs/voice/runtime.md, "Use Zadarma".
 */

export async function main(argv = process.argv.slice(2), env: Record<string, string | undefined> = process.env): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { country: { type: "string" } } });
  const key = env.ZADARMA_API_KEY?.trim();
  const secret = env.ZADARMA_API_SECRET?.trim();
  if (!key || !secret) throw new Error("Set ZADARMA_API_KEY and ZADARMA_API_SECRET.");
  const country = (values.country ?? "RS").toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new Error("--country takes a two-letter code, such as RS.");
  const documentsGroupId = env.ZADARMA_DOCUMENTS_GROUP_ID?.trim() || undefined;
  const report = await checkZadarma(new ZadarmaClient({ key, secret }), { country, documentsGroupId });
  console.log(JSON.stringify(report, null, 2));
  for (const line of adviseZadarma(report, { documentsGroupId, sipHost: env.ZADARMA_SIP_HOST?.trim() || undefined })) console.log(`- ${line}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
