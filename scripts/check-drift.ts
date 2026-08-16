import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors: string[] = [];

function readText(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function listFiles(directory: string): string[] {
  const absoluteDirectory = join(root, directory);
  if (!existsSync(absoluteDirectory)) {
    return [];
  }

  const files: string[] = [];
  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const absolutePath = join(absoluteDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(relative(root, absolutePath)));
    } else {
      files.push(relative(root, absolutePath));
    }
  }
  return files;
}

function requireFile(path: string): void {
  if (!existsSync(join(root, path))) {
    errors.push(`missing required file: ${path}`);
  }
}

function extractAll(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].flatMap((match) => (match[1] ? [match[1]] : []));
}

function sortedDifference(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return [...new Set(left)].filter((value) => !rightSet.has(value)).sort();
}

for (const path of [
  "Dockerfile.admin",
  "Dockerfile.migrator",
  "Dockerfile.worker",
  "Dockerfile.voice-gateway",
  "Dockerfile.otel-collector",
  "docker-compose.yml",
  "docker/otel-collector/config.yaml",
  "docker/otel-collector/railway.json",
  "docker/prometheus/prometheus.yml",
  "docker/prometheus/rules/alerts.yml",
  "docker/prometheus/tests/alerts.test.yml",
  ".github/workflows/replacement-platform.yml",
  "apps/admin/railway.json",
  "apps/worker/railway.json",
  "apps/voice-gateway/railway.json",
  "docs/deployment/railway.md",
  "docs/operations/alerts.md",
  "docs/operations/backup-restore.md",
  "docs/validation/certification-runbook.md",
  "docs/validation/posthog-otel-validation.md",
  "packages/db/migrations/0002_rls.sql",
  "packages/db/migrations/0012_dispatcher_runtime.sql",
  "packages/db/migrations/0013_billing_checkout.sql",
  "packages/db/migrations/0016_conversation_session_summaries.sql",
  "packages/contracts/src/index.ts",
  "packages/jobs/src/index.ts",
  "packages/domain/src/index.ts",
  "apps/admin/app/api/health/live/route.ts",
  "apps/admin/app/api/health/ready/route.ts",
  "apps/worker/src/health.ts",
]) {
  requireFile(path);
}

if (!readText("apps/admin/app/api/calls/route.ts").includes("withOperatorTransaction")) {
  errors.push("operator call creation is missing an RLS-scoped membership transaction");
}
if (!readText("packages/db/migrations/0012_dispatcher_runtime.sql").includes("lobbystack_dispatcher")) {
  errors.push("dispatcher runtime migration is missing dispatcher role configuration");
}
if (!readText("apps/worker/src/index.ts").includes("new OutboxDispatcher(dispatcherDatabase.db")) {
  errors.push("outbox dispatcher is not using the dedicated dispatcher database role");
}
const replacementWorkflow = readText(".github/workflows/replacement-platform.yml");
if (!replacementWorkflow.includes("docker/postgres/init/roles.sh") || !replacementWorkflow.includes("VERIFY_RLS_BEHAVIOR")) {
  errors.push("replacement CI is missing runtime-role initialization or behavioral RLS verification");
}
const telemetryIndex = readText("packages/telemetry/src/index.ts");
const adminNextConfig = readText("apps/admin/next.config.ts");
if (telemetryIndex.includes('export * from "./node"') || telemetryIndex.includes('export * from "./browser"')) {
  errors.push("telemetry root entrypoint re-exports runtime-specific modules");
}
if (!adminNextConfig.includes('"@lobbystack/telemetry/node"')) {
  errors.push("admin Next.js config does not externalize Node telemetry");
}
const contracts = readText("packages/contracts/src/index.ts");
const jobs = readText("packages/jobs/src/index.ts");
const handlers = readText("apps/worker/src/handlers.ts");
const jobBlock = contracts.match(/export const jobTypes = \[(.*?)] as const/s)?.[1] ?? "";
const jobTypes = extractAll(jobBlock, /"([a-zA-Z0-9_.]+)"/g);
for (const jobType of jobTypes) {
  if (!jobs.includes(`"${jobType}"`)) {
    errors.push(`job type is missing from queue mapping: ${jobType}`);
  }
  if (!handlers.includes(`"${jobType}"`)) {
    errors.push(`job type is missing from worker handler: ${jobType}`);
  }
}

const schema = readText("packages/db/src/schema/index.ts");
const rls = readText("packages/db/migrations/0002_rls.sql");
const allTenantBlock = schema.match(/export const allTenantTables = \[(.*?)] as const/s)?.[1] ?? "";
const schemaTablePairs = [...schema.matchAll(/export const (\w+) = pgTable\(\s*"([^"]+)"/g)].map(([, variable, table]) => [variable, table] as const);
const schemaTablesByVariable = new Map(schemaTablePairs);
const replacementTenantTables = extractAll(allTenantBlock, /\b([a-zA-Z0-9_]+),/g)
  .map((variable) => schemaTablesByVariable.get(variable))
  .filter((table): table is string => table !== undefined);
const rlsTenantBlock = rls.match(/tenant_tables text\[\] := ARRAY\[(.*?)]/s)?.[1] ?? "";
const migrationSources = listFiles("packages/db/migrations")
  .filter((file) => file.endsWith(".sql"))
  .map(readText);
const explicitRlsTables = migrationSources.flatMap((source) => extractAll(source, /ALTER TABLE\s+(?:public\.)?([a-zA-Z0-9_]+)\s+ENABLE ROW LEVEL SECURITY/gi));
const dynamicRlsTables = migrationSources.flatMap((source) => source.includes("ENABLE ROW LEVEL SECURITY")
  ? extractAll(source, /FOREACH\s+\w+\s+IN ARRAY ARRAY\[(.*?)]\s+LOOP/gs).flatMap((block) => extractAll(block, /'([^']+)'/g))
  : []);
const rlsTenantTables = [...new Set([...extractAll(rlsTenantBlock, /'([^']+)'/g), ...explicitRlsTables, ...dynamicRlsTables].filter((table) => replacementTenantTables.includes(table)))];
for (const table of sortedDifference(replacementTenantTables, rlsTenantTables)) {
  errors.push(`tenant table is missing from RLS migration: ${table}`);
}
for (const table of sortedDifference(rlsTenantTables, replacementTenantTables)) {
  errors.push(`RLS migration names a table missing from Drizzle allTenantTables: ${table}`);
}
if (!rls.includes("ALTER TABLE public.affiliate_profiles ENABLE ROW LEVEL SECURITY")) {
  errors.push("affiliate_profiles is missing its dedicated RLS policy");
}

const compose = readText("docker-compose.yml");
for (const endpoint of ["https://us.i.posthog.com/i/v1/traces", "https://us.i.posthog.com/i/v1/metrics", "https://us.i.posthog.com/i/v1/logs"]) {
  if (!compose.includes(endpoint)) {
    errors.push(`OTel collector is missing the PostHog signal endpoint: ${endpoint}`);
  }
}
if ((compose.match(/DATABASE_URL: postgres:\/\/postgres:/g) ?? []).length > 1) {
  errors.push("runtime services must not use the PostgreSQL superuser URL");
}
for (const service of ["postgres", "redis", "minio", "minio-init", "migrator", "otel-collector", "otel-certifier", "admin", "worker", "voice-gateway", "caddy", "prometheus"]) {
  if (!new RegExp(`^  ${service}:`, "m").test(compose)) {
    errors.push(`Compose service is missing: ${service}`);
  }
}
for (const service of ["admin", "worker", "voice-gateway", "caddy"]) {
  const block = compose.match(new RegExp(`^  ${service}:([\\s\\S]*?)(?=^  [a-z][a-z0-9-]*:|^volumes:)`, "m"))?.[1] ?? "";
  if (!block.includes("healthcheck:")) {
    errors.push(`Compose service is missing a healthcheck: ${service}`);
  }
}
if (!readText("docker/prometheus/prometheus.yml").includes("/etc/prometheus/rules/*.yml")) {
  errors.push("Prometheus configuration is missing replacement alert rules");
}
if (!replacementWorkflow.includes("test rules /etc/prometheus/tests/alerts.test.yml")) {
  errors.push("replacement CI is missing Prometheus alert rule tests");
}
for (const variable of ["POLAR_WEBHOOK_SECRET", "RESEND_WEBHOOK_SECRET", "TWILIO_AUTH_TOKEN", "TWILIO_SMS_WEBHOOK_URL", "TWILIO_STATUS_CALLBACK_URL"]) {
  if (!compose.includes(`${variable}:`)) {
    errors.push(`Admin webhook configuration is missing ${variable}`);
  }
}
for (const file of ["scripts/replacement-backup.sh", "scripts/replacement-restore.sh", "scripts/replacement-restore-drill.sh", "scripts/replacement-privacy-check.ts"]) {
  if (!existsSync(resolve(root, file))) {
    errors.push(`Recovery script is missing: ${file}`);
  }
}

const replacementSourceFiles = ["apps/admin", "apps/worker", "packages/contracts", "packages/db", "packages/domain", "packages/jobs", "packages/providers", "packages/telemetry"]
  .flatMap(listFiles)
  .filter((file) => /\.(ts|tsx|mts)$/.test(file));
for (const file of replacementSourceFiles) {
  const source = readText(file);
  if (/from\s+["'][^"']*convex\//.test(source) || /from\s+["']convex["']/.test(source)) {
    errors.push(`replacement source imports Convex directly: ${file}`);
  }
}

if (errors.length > 0) {
  console.error(`Replacement drift check failed with ${errors.length} issue${errors.length === 1 ? "" : "s"}:`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Replacement drift check passed: ${jobTypes.length} job types, ${replacementTenantTables.length} tenant tables, and required deployment files are aligned.`);
