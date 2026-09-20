import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

import {
  TELEMETRY_EVENT_NAMES,
  TELEMETRY_EVENT_TRANSPORT,
  type TelemetryEventName,
  type TelemetryTransport,
} from "../packages/telemetry/src/index";

// Entries are temporary and require a reviewable reason. Delete an entry in the
// same change that adds its real producer.
export const KNOWN_UNPRODUCED: Partial<Record<TelemetryEventName, string>> = {
  "ops.billing.unit_economics_rollup_recorded": "Rollup producer is pending billing reconciliation work.",
  "ops.billing.usage_sync_recovered": "The billing schema has no durable failed state from which to detect recovery.",
  "ops.outbox.flush_failed": "The dispatcher connects as lobbystack_dispatcher, which has no INSERT grant on product_events, and global poll failures have no tenant to scope an RLS-safe row to. Tracked by OTel counters (lobbystack.outbox.dispatch_failures, lobbystack.outbox.dead_lettered, lobbystack.outbox.poll_failures) until a worker-role consumer exists.",
  "ops.service.health_check": "Retired Convex prober must be decommissioned before this contract is removed.",
  "ops.service.health_check_failed": "Retired Convex prober must be decommissioned before this contract is removed.",
  "prospect_demo.signup_clicked": "No privacy-safe server touchpoint exists for this intent yet.",
  "sms.delivery_accepted": "SMS is not in use; schema is retained for future activation.",
  "sms.delivery_failed": "SMS is not in use; schema is retained for future activation.",
  "sms.inbound_received": "SMS is not in use; schema is retained for future activation.",
  "sms.provider_cost_recorded": "SMS is not in use; schema is retained for future activation.",
};

const ROOTS = ["apps", "packages"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "dist" || entry.name === "node_modules") return [];
      return sourceFiles(path);
    }
    if (!SOURCE_EXTENSIONS.has(extname(path)) || /\.test\.tsx?$/.test(path)) return [];
    if (path.endsWith("packages/telemetry/src/index.ts")) return [];
    return [path];
  }));
  return files.flat();
}

function transportForPath(path: string, event: TelemetryEventName): TelemetryTransport {
  if (path.startsWith("apps/voice-gateway/")) return "gateway";
  if (event.startsWith("web.")) return "browser";
  return "durable";
}

async function main(): Promise<void> {
  const paths = (await Promise.all(ROOTS.map(sourceFiles))).flat();
  const sources = await Promise.all(paths.map(async (path) => ({
    path: relative(process.cwd(), path),
    source: await readFile(path, "utf8"),
  })));
  const failures: string[] = [];

  for (const event of TELEMETRY_EVENT_NAMES) {
    const quoted = [`"${event}"`, `'${event}'`];
    const producers = sources.filter(({ source }) => quoted.some((literal) => source.includes(literal)));
    if (producers.length > 0 && KNOWN_UNPRODUCED[event]) {
      failures.push(`${event}: has a producer but remains in KNOWN_UNPRODUCED`);
    }
    if (producers.length === 0 && !KNOWN_UNPRODUCED[event]) {
      failures.push(`${event}: no producer and no KNOWN_UNPRODUCED justification`);
      continue;
    }
    for (const producer of producers) {
      const transport = transportForPath(producer.path, event);
      if (!TELEMETRY_EVENT_TRANSPORT[event].includes(transport)) {
        failures.push(`${event}: ${producer.path} implies ${transport}, allowed ${TELEMETRY_EVENT_TRANSPORT[event].join("/")}`);
      }
    }
  }

  for (const { path, source } of sources) {
    for (const match of source.matchAll(/(?:name|event):\s*["']([^"']+)["']/g)) {
      const event = match[1]!;
      if ((event.includes(".") || event.startsWith("$")) &&
          /(recordProductEvent|captureOperationalEvent)/.test(source.slice(Math.max(0, match.index! - 250), match.index!)) &&
          !TELEMETRY_EVENT_NAMES.includes(event as TelemetryEventName)) {
        failures.push(`${path}: telemetry call uses unregistered literal ${event}`);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`Telemetry registry coverage failed:\n- ${failures.join("\n- ")}`);
  }
  console.log(`Telemetry registry coverage passed (${TELEMETRY_EVENT_NAMES.length} events, ${Object.keys(KNOWN_UNPRODUCED).length} temporary exceptions).`);
}

await main();
