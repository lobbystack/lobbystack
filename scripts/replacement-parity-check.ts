import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type RequiredCapability = { id: string; status: "required"; implementation: string[]; tests: string[]; certification: string[] };
type ExcludedCapability = { id: string; status: "excluded"; reason: string; forbiddenPatterns: string[] };
type RetiredCapability = { id: string; status: "retired"; reason: string };
type Capability = RequiredCapability | ExcludedCapability | RetiredCapability;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "docs/validation/replacement-parity.json"), "utf8")) as { capabilities: Capability[]; excludedScanRoots: string[] };
const failures: string[] = [];

function filesUnder(path: string): string[] {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((entry) => filesUnder(join(path, entry)));
}

const ids = new Set<string>();
for (const capability of manifest.capabilities) {
  if (ids.has(capability.id)) failures.push(`${capability.id}: duplicate capability id`);
  ids.add(capability.id);
  if (capability.status === "required") {
    for (const field of ["implementation", "tests", "certification"] as const) {
      if (capability[field].length === 0) failures.push(`${capability.id}: ${field} evidence is empty`);
      for (const path of capability[field]) if (!existsSync(join(root, path))) failures.push(`${capability.id}: missing ${field} evidence ${path}`);
    }
  } else if (!capability.reason.trim()) {
    failures.push(`${capability.id}: ${capability.status} capability requires a reason`);
  }
}

const excluded = manifest.capabilities.filter((capability): capability is ExcludedCapability => capability.status === "excluded");
const scanFiles = manifest.excludedScanRoots.flatMap((path) => filesUnder(join(root, path))).filter((path) => /\.(?:ts|tsx|js|mjs|sql)$/.test(path));
for (const capability of excluded) {
  for (const path of scanFiles) {
    const source = readFileSync(path, "utf8");
    for (const pattern of capability.forbiddenPatterns) if (source.includes(pattern)) failures.push(`${capability.id}: forbidden pattern ${pattern} found in ${path.slice(root.length + 1)}`);
  }
}

if (!manifest.capabilities.some((capability) => capability.status === "retired")) failures.push("manifest must document retired capabilities");
if (failures.length > 0) {
  console.error(`Replacement parity check failed with ${failures.length} issue${failures.length === 1 ? "" : "s"}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const counts = Object.fromEntries(["required", "excluded", "retired"].map((status) => [status, manifest.capabilities.filter((capability) => capability.status === status).length]));
console.log(`Replacement parity check passed: ${counts.required} required, ${counts.excluded} excluded, ${counts.retired} retired.`);
