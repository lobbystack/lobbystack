import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

export type ReleaseMode = "local" | "staging";
export type GateStatus = "planned" | "passed" | "failed" | "not-run";
export type ReleaseStatus = Exclude<GateStatus, "not-run">;

export type Gate = {
  id: string;
  commandName: string;
  executable: string;
  args: string[];
  e2e?: true;
};

export type GateEvidence = {
  id: string;
  commandName: string;
  status: GateStatus;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  outputDigest: string | null;
  playwright?: { executed: number; passed: number; skipped: number; flaky: number; failed: number };
};
export type ReleaseEvidence = {
  runId: string;
  gitSha: string;
  timestamp: string;
  dirtyGit: boolean | "unavailable";
  mode: ReleaseMode;
  e2e: boolean;
  status: ReleaseStatus;
  scope: {
    releaseCertified: false;
    targetIdentity: string;
    resendWebhooks: "not-applicable" | "unverified" | "enabled" | "disabled";
    outstandingExternalGates: string[];
  };
  gates: GateEvidence[];
};
export type CommandResult = { exitCode: number; output: string };
export type CommandExecutor = (gate: Gate, environment: NodeJS.ProcessEnv) => Promise<CommandResult>;
export type ReleaseReadinessOptions = {
  mode?: ReleaseMode;
  plan?: boolean;
  e2e?: boolean;
  environment?: NodeJS.ProcessEnv;
  runId?: string;
  gitSha?: string;
  execute?: CommandExecutor;
};

const localGates: readonly Gate[] = [
  { id: "lint", commandName: "lint", executable: "pnpm", args: ["lint"] },
  { id: "typecheck", commandName: "typecheck", executable: "pnpm", args: ["typecheck"] },
  { id: "test", commandName: "test", executable: "pnpm", args: ["test"] },
  { id: "build", commandName: "build", executable: "pnpm", args: ["build"] },
];

const coreE2eGate: Gate = {
  id: "playwright-functional-fixtures",
  commandName: "playwright-functional-fixtures",
  executable: "pnpm",
  args: [
    "--filter", "@lobbystack/admin", "exec", "playwright", "test",
    "--reporter=json",
  ],
  e2e: true,
};
const calendarDomainGate: Gate = { id: "calendar-booking", commandName: "calendar-booking", executable: "pnpm", args: ["replacement:calendar"] };

const stagingGates: readonly Gate[] = [
  { id: "performance", commandName: "performance", executable: "pnpm", args: ["replacement:performance"] },
  { id: "storage", commandName: "storage", executable: "pnpm", args: ["replacement:storage"] },
  { id: "realtime", commandName: "realtime", executable: "pnpm", args: ["replacement:realtime"] },
  { id: "webhooks", commandName: "webhooks", executable: "pnpm", args: ["replacement:webhooks"] },
  // This mutates and removes fixture data; isolated-target validation is mandatory.
  { id: "privacy", commandName: "privacy", executable: "pnpm", args: ["replacement:privacy"] },
  { id: "smoke", commandName: "smoke", executable: "pnpm", args: ["replacement:smoke"] },
  { id: "internal", commandName: "internal", executable: "pnpm", args: ["replacement:internal"] },
];

const stagingRequired = [
  "RELEASE_CERTIFICATION_TARGET", "ADMIN_BASE_URL", "WORKER_BASE_URL", "VOICE_BASE_URL", "DATABASE_URL",
  "REPLACEMENT_MIGRATOR_DATABASE_URL", "REPLACEMENT_APP_DATABASE_URL", "REPLACEMENT_WORKER_DATABASE_URL",
  "REDIS_URL", "REPLACEMENT_REDIS_HOST", "REDIS_PORT", "REPLACEMENT_S3_ENDPOINT", "S3_BUCKET",
  "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "POLAR_WEBHOOK_SECRET", "TWILIO_AUTH_TOKEN",
  "INTERNAL_SERVICE_SECRET", "REPLACEMENT_TEST_BUSINESS_SLUG", "RESEND_WEBHOOKS_ENABLED",
] as const;

const e2eRequired = [
  "RELEASE_E2E_WORKER_PAUSED", "PLAYWRIGHT_BASE_URL", "REPLACEMENT_E2E_DATABASE_URL",
  "LOBBYSTACK_APP_DATABASE_URL", "LOBBYSTACK_AUTH_DATABASE_URL", "LOBBYSTACK_WORKER_DATABASE_URL", "LOBBYSTACK_DISPATCHER_DATABASE_URL", "WIDGET_E2E", "PASSWORD_RECOVERY_E2E",
  "WEBSITE_IMPORT_E2E", "DEMO_OPERATOR_E2E", "PARITY_PORT_OPERATOR_STORAGE_STATE_FR",
  "PARITY_PORT_OPERATOR_STORAGE_STATE_EN", "PARITY_OPERATOR_USER_ID",
  "PROSPECT_DEMO_OPERATOR_EMAIL", "BETTER_AUTH_SECRET",
] as const;

export function releaseGates(mode: ReleaseMode, e2e = false): readonly Gate[] {
  if (mode === "staging") return stagingGates;
  return e2e ? [...localGates, calendarDomainGate, coreE2eGate] : localGates;
}

export function missingRequiredEnvironment(environment: NodeJS.ProcessEnv, names: readonly string[]): string[] {
  return names.filter((name) => !environment[name]?.trim());
}

function urlIsLocal(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "::1" || hostname === "[::1]" || hostname === "0.0.0.0" || hostname.startsWith("127.") || hostname.endsWith(".localhost") || hostname.endsWith(".local");
  } catch {
    return true;
  }
}

function databaseHasCertificationName(value: string): boolean {
  try {
    const url = new URL(value);
    return ["postgres:", "postgresql:"].includes(url.protocol) && /^\/certification(?:_[a-z0-9_-]+)?$/i.test(decodeURIComponent(url.pathname));
  } catch {
    return false;
  }
}

function databaseRoleMatches(value: string, role: string): boolean {
  try {
    return new URL(value).username === role;
  } catch {
    return false;
  }
}

function isDisposableE2eDatabase(value: string): boolean {
  try { const url = new URL(value); return ["postgres:", "postgresql:"].includes(url.protocol) && /^\/parity_cert_[a-z0-9_]+$/i.test(decodeURIComponent(url.pathname)) && !url.search && !url.hash; }
  catch { return false; }
}

function databaseTarget(value: string): string | undefined {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}:${url.port || "5432"}${url.pathname}`;
  } catch {
    return undefined;
  }
}

function targetIdentity(mode: ReleaseMode, environment: NodeJS.ProcessEnv, e2e: boolean): string {
  if (mode === "local") return e2e ? `local-fixtures:${createHash("sha256").update([environment.PLAYWRIGHT_BASE_URL, databaseTarget(environment.REPLACEMENT_E2E_DATABASE_URL ?? "")].join("|")).digest("hex").slice(0, 16)}` : "local-baseline";
  const source = [environment.ADMIN_BASE_URL, environment.WORKER_BASE_URL, databaseTarget(environment.REPLACEMENT_MIGRATOR_DATABASE_URL ?? "")].join("|");
  return `isolated-staging:${createHash("sha256").update(source).digest("hex").slice(0, 16)}`;
}

export function stagingConfigurationProblems(environment: NodeJS.ProcessEnv): string[] {
  const problems = missingRequiredEnvironment(environment, stagingRequired);
  if (environment.RELEASE_CERTIFICATION_TARGET !== "isolated-staging") problems.push("RELEASE_CERTIFICATION_TARGET (must be isolated-staging)");
  for (const name of ["ADMIN_BASE_URL", "WORKER_BASE_URL", "VOICE_BASE_URL", "REDIS_URL", "REPLACEMENT_S3_ENDPOINT"]) {
    if (environment[name] && urlIsLocal(environment[name])) problems.push(`${name} (must not be local)`);
  }
  if (environment.REPLACEMENT_REDIS_HOST && /^(localhost|127\.|::1)|\.local$/i.test(environment.REPLACEMENT_REDIS_HOST)) problems.push("REPLACEMENT_REDIS_HOST (must not be local)");
  for (const name of ["DATABASE_URL", "REPLACEMENT_MIGRATOR_DATABASE_URL", "REPLACEMENT_APP_DATABASE_URL", "REPLACEMENT_WORKER_DATABASE_URL"]) {
    if (environment[name] && (urlIsLocal(environment[name]) || !databaseHasCertificationName(environment[name]))) problems.push(`${name} (must target a non-local certification database)`);
  }
  for (const [name, role] of [["REPLACEMENT_MIGRATOR_DATABASE_URL", "lobbystack_migrator"], ["REPLACEMENT_APP_DATABASE_URL", "lobbystack_app"], ["REPLACEMENT_WORKER_DATABASE_URL", "lobbystack_worker"]] as const) {
    if (environment[name] && !databaseRoleMatches(environment[name], role)) problems.push(`${name} (must use ${role})`);
  }
  const databaseTargets = ["DATABASE_URL", "REPLACEMENT_MIGRATOR_DATABASE_URL", "REPLACEMENT_APP_DATABASE_URL", "REPLACEMENT_WORKER_DATABASE_URL"]
    .map((name) => environment[name] && databaseTarget(environment[name]!)).filter(Boolean);
  if (new Set(databaseTargets).size > 1) problems.push("Staging role databases (must target the same disposable database)");
  if (environment.REPLACEMENT_TEST_BUSINESS_SLUG && !environment.REPLACEMENT_TEST_BUSINESS_SLUG.startsWith("certification-")) {
    problems.push("REPLACEMENT_TEST_BUSINESS_SLUG (must use the certification- prefix)");
  }
  if (environment.RESEND_WEBHOOKS_ENABLED && !["true", "false"].includes(environment.RESEND_WEBHOOKS_ENABLED)) problems.push("RESEND_WEBHOOKS_ENABLED (must be true or false)");
  if (environment.RESEND_WEBHOOKS_ENABLED === "true" && !environment.RESEND_WEBHOOK_SECRET?.trim()) problems.push("RESEND_WEBHOOK_SECRET (required when Resend webhooks are enabled)");
  return [...new Set(problems)];
}

export function e2eConfigurationProblems(environment: NodeJS.ProcessEnv): string[] {
  const problems = missingRequiredEnvironment(environment, e2eRequired);
  for (const name of ["RELEASE_E2E_WORKER_PAUSED", "WIDGET_E2E", "PASSWORD_RECOVERY_E2E", "WEBSITE_IMPORT_E2E", "DEMO_OPERATOR_E2E"]) {
    if (environment[name] && environment[name] !== "1") problems.push(`${name} (must be 1)`);
  }
  if (environment.PLAYWRIGHT_BASE_URL && !urlIsLocal(environment.PLAYWRIGHT_BASE_URL)) problems.push("PLAYWRIGHT_BASE_URL (must be local)");
  const roleUrls = [["REPLACEMENT_E2E_DATABASE_URL", "lobbystack_migrator"], ["LOBBYSTACK_APP_DATABASE_URL", "lobbystack_app"], ["LOBBYSTACK_AUTH_DATABASE_URL", "lobbystack_auth"], ["LOBBYSTACK_WORKER_DATABASE_URL", "lobbystack_worker"], ["LOBBYSTACK_DISPATCHER_DATABASE_URL", "lobbystack_dispatcher"]] as const;
  for (const [name, role] of roleUrls) {
    if (environment[name] && (!urlIsLocal(environment[name]) || !databaseRoleMatches(environment[name], role))) problems.push(`${name} (must be a local ${role} database)`);
    if (environment[name] && !isDisposableE2eDatabase(environment[name])) problems.push(`${name} (must use a disposable parity_cert_ database)`);
  }
  const targets = roleUrls.map(([name]) => environment[name] && databaseTarget(environment[name])).filter((value): value is string => Boolean(value));
  if (targets.length > 1 && new Set(targets).size !== 1) problems.push("E2E role databases (must target the same disposable database)");
  return [...new Set(problems)];
}

export function fullE2eEnvironment(environment: NodeJS.ProcessEnv, reportPath: string): NodeJS.ProcessEnv {
  return {
    ...environment,
    CI: "1",
    DATABASE_URL: environment.REPLACEMENT_E2E_DATABASE_URL,
    PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath,
    // The widget fixture accepts only this local provider, never a live AI credential.
    AI_CHAT_API_KEY: "local-widget-certification",
    AI_CHAT_BASE_URL: "http://127.0.0.1:18090/v1",
    AI_CHAT_MODEL: "release-e2e-fixture",
  };
}

type PlaywrightTest = { status?: string; results?: Array<{ status?: string }> };
type PlaywrightSuite = { suites?: PlaywrightSuite[]; specs?: Array<{ tests?: PlaywrightTest[] }> };

export function assertPlaywrightReport(report: unknown): NonNullable<GateEvidence["playwright"]> {
  const tests: PlaywrightTest[] = [];
  const visit = (suite: PlaywrightSuite): void => {
    for (const spec of suite.specs ?? []) tests.push(...(spec.tests ?? []));
    for (const nested of suite.suites ?? []) visit(nested);
  };
  visit(report as PlaywrightSuite);
  const skipped = tests.filter((test) => test.status === "skipped" || (test.results?.length && test.results.every((result) => result.status === "skipped"))).length;
  const flaky = tests.filter((test) => test.status === "flaky" || (test.results?.some((result) => result.status === "passed") && test.results.some((result) => result.status === "failed"))).length;
  const executed = tests.filter((test) => test.results?.some((result) => result.status !== "skipped")).length;
  if (skipped || flaky || !executed) throw new Error(`Playwright JSON report requires executed tests with zero skipped and flaky results (executed=${executed}, skipped=${skipped}, flaky=${flaky}).`);
  if (tests.some((test) => test.status !== "expected" || !test.results?.length || test.results.some((result) => result.status !== "passed"))) {
    throw new Error("Every required Playwright test must pass on every attempt.");
  }
  return { executed, passed: executed, skipped, flaky, failed: 0 };
}

function currentGitSha(): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  return result.status === 0 && result.stdout.trim() ? result.stdout.trim() : "unavailable";
}

function dirtyGit(): boolean | "unavailable" {
  const result = spawnSync("git", ["status", "--porcelain"], { encoding: "utf8" });
  return result.status === 0 ? Boolean(result.stdout.trim()) : "unavailable";
}

async function executeGate(gate: Gate, environment: NodeJS.ProcessEnv): Promise<CommandResult> {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(gate.executable, gate.args, { cwd: resolve(import.meta.dirname, ".."), env: environment, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => { const text = chunk.toString(); output += text; process.stdout.write(text); });
    child.stderr.on("data", (chunk: Buffer) => { const text = chunk.toString(); output += text; process.stderr.write(text); });
    child.once("error", reject);
    child.once("close", (code) => resolvePromise({ exitCode: code ?? 1, output }));
  });
}

function gateEvidence(gate: Gate, status: GateStatus = "not-run"): GateEvidence {
  return { id: gate.id, commandName: gate.commandName, status, startedAt: null, finishedAt: null, durationMs: null, outputDigest: null };
}

function evidence(mode: ReleaseMode, e2e: boolean, runId: string, gitSha: string, environment: NodeJS.ProcessEnv): ReleaseEvidence {
  return {
    runId, gitSha, timestamp: new Date().toISOString(), dirtyGit: dirtyGit(), mode, e2e, status: "passed",
    scope: {
      releaseCertified: false,
      targetIdentity: targetIdentity(mode, environment, e2e),
      resendWebhooks: mode === "staging" ? environment.RESEND_WEBHOOKS_ENABLED === "true" ? "enabled" : environment.RESEND_WEBHOOKS_ENABLED === "false" ? "disabled" : "unverified" : "not-applicable",
      outstandingExternalGates: [
        "complete production importer and source-to-target reconciliation",
        "two clean-target production-snapshot migration rehearsals",
        "legacy mutation freeze and provider-specific durable ingress handling",
        "isolated database and object-storage restore and traffic rollback drill",
        "manual paid-provider verification",
        "full journey, visual, performance soak, privacy and alert certification",
        "manual production rollout approval",
      ],
    },
    gates: [],
  };
}

function markNotRun(evidence: ReleaseEvidence, gates: readonly Gate[], from: number): void {
  for (const gate of gates.slice(from)) evidence.gates.push(gateEvidence(gate));
}

export async function runReleaseReadiness(options: ReleaseReadinessOptions = {}): Promise<ReleaseEvidence> {
  const mode = options.mode ?? "local";
  const e2e = options.e2e === true;
  const gates = releaseGates(mode, e2e);
  const environment = options.environment ? { ...process.env, ...options.environment } : process.env;
  const result = evidence(mode, e2e, options.runId ?? (environment.RELEASE_RUN_ID?.trim() || randomUUID()), options.gitSha ?? (environment.GITHUB_SHA?.trim() || currentGitSha()), environment);
  if (options.plan) {
    result.status = "planned";
    result.gates = gates.map((gate) => gateEvidence(gate, "planned"));
    return result;
  }
  const problems = mode === "staging" ? stagingConfigurationProblems(environment) : e2e ? e2eConfigurationProblems(environment) : [];
  if (problems.length) {
    result.status = "failed";
    markNotRun(result, gates, 0);
    console.error(`Release readiness configuration rejected: ${problems.join(", ")}.`);
    return result;
  }
  const executor = options.execute ?? executeGate;
  let e2eDirectory: string | undefined;
  try {
    if (e2e) e2eDirectory = await mkdtemp(join(tmpdir(), "release-readiness-"));
    for (let index = 0; index < gates.length; index += 1) {
      const gate = gates[index]!;
      const reportPath = gate.e2e && e2eDirectory ? join(e2eDirectory, "playwright.json") : undefined;
      const gateEnvironment: NodeJS.ProcessEnv = reportPath ? fullE2eEnvironment(environment, reportPath) : { ...environment };
      // tsx sets this for its own process. A relative parent config is invalid
      // after pnpm changes into a workspace; child commands choose their own.
      delete gateEnvironment.TSX_TSCONFIG_PATH;
      if (mode === "staging" && environment.RESEND_WEBHOOKS_ENABLED === "false") delete gateEnvironment.RESEND_WEBHOOK_SECRET;
      const gateResult = gateEvidence(gate);
      gateResult.status = "failed";
      gateResult.startedAt = new Date().toISOString();
      const started = performance.now();
      try {
        const command = await executor(gate, gateEnvironment);
        gateResult.outputDigest = createHash("sha256").update(command.output).digest("hex");
        if (command.exitCode !== 0) throw new Error(`${gate.commandName} exited with code ${command.exitCode}.`);
        if (reportPath) gateResult.playwright = assertPlaywrightReport(JSON.parse(await readFile(reportPath, "utf8")) as unknown);
        gateResult.status = "passed";
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        gateResult.finishedAt = new Date().toISOString();
        gateResult.durationMs = Math.round(performance.now() - started);
        result.gates.push(gateResult);
        markNotRun(result, gates, index + 1);
        result.status = "failed";
        return result;
      }
      gateResult.finishedAt = new Date().toISOString();
      gateResult.durationMs = Math.round(performance.now() - started);
      result.gates.push(gateResult);
    }
  } finally {
    if (e2eDirectory) await rm(e2eDirectory, { recursive: true, force: true });
  }
  return result;
}

export async function writeReleaseEvidence(filePath: string, releaseEvidence: ReleaseEvidence): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(releaseEvidence, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await chmod(filePath, 0o600);
}

type CliOptions = { mode: ReleaseMode; plan: boolean; e2e: boolean; evidencePath?: string };
export function parseReleaseReadinessArgs(args: string[]): CliOptions {
  let mode: ReleaseMode = "local"; let plan = false; let e2e = false; let evidencePath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--local") mode = "local";
    else if (argument === "--staging") mode = "staging";
    else if (argument === "--plan" || argument === "--dry-run") plan = true;
    else if (argument === "--e2e") e2e = true;
    else if (argument === "--evidence") { evidencePath = args[index + 1]; if (!evidencePath) throw new Error("--evidence requires a file path."); index += 1; }
    else throw new Error(`Unknown release-readiness option: ${argument}.`);
  }
  if (mode === "staging" && e2e) throw new Error("--e2e is available only for the local baseline.");
  return { mode, plan, e2e, ...(evidencePath ? { evidencePath } : {}) };
}

async function main(): Promise<void> {
  const options = parseReleaseReadinessArgs(process.argv.slice(2));
  const result = await runReleaseReadiness(options);
  if (options.evidencePath) await writeReleaseEvidence(options.evidencePath, result);
  console.log(JSON.stringify(result));
  if (result.status === "failed") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
