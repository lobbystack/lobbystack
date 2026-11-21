import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { createZadarmaCarrier } from "@lobbystack/providers/zadarma/zadarmaCarrier";

/**
 * Points one of the Zadarma account's numbers at the SIP server in docker/asterisk, which is what a number LobbyStack
 * orders gets automatically. Use it for a number ordered by hand, such as the first one.
 *
 *   pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/operations/zadarma-route.ts --number +381213860081 [--apply]
 *
 * Dry-run is the default; pass --apply to change the number's destination. The destination becomes
 * <digits>@ZADARMA_SIP_HOST, which the server reads the dialled number from. It uses ZADARMA_API_KEY and
 * ZADARMA_API_SECRET, and refuses a number that isn't on the account. See docs/voice/external-numbers.md.
 */

export async function main(argv = process.argv.slice(2), env: Record<string, string | undefined> = process.env): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { number: { type: "string" }, apply: { type: "boolean" } } });
  if (!values.number || !/^\+[1-9]\d{7,14}$/.test(values.number)) throw new Error("Use --number with an E.164 number, for example +381213860081.");
  const carrier = createZadarmaCarrier(env);
  if (!carrier?.inventory || !carrier.routing) throw new Error("Set ZADARMA_API_KEY and ZADARMA_API_SECRET.");
  const missing = carrier.routing.missingSetup();
  if (missing) throw new Error(missing);
  const owned = await carrier.inventory.findOwnedPhoneNumber({ e164: values.number });
  if (!owned) throw new Error(`${values.number} isn't on the Zadarma account.`);
  const digits = values.number.slice(1);
  console.log(JSON.stringify({ number: values.number, destination: `${digits}@${env.ZADARMA_SIP_HOST?.trim()}`, apply: values.apply ?? false }));
  if (!values.apply) return;
  const routed = await carrier.routing.routeNumber({ providerPhoneId: owned.providerPhoneId, mode: "receptionist" });
  console.log(JSON.stringify({ number: values.number, routedTo: routed.target }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
