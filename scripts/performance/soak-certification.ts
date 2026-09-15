import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { percentile } from "./metrics";

export const MINIMUM_SOAK_SECONDS = 1800;
export const DEFAULT_HEALTH_CONCURRENCY = 30;

export type SoakCategory =
  | "ordinary-api"
  | "realtime"
  | "voice-context"
  | "webhook-durable-response"
  | "outbox-dispatch";

// Mirrors docs/validation/production-readiness.md "Operations soak".
export const SOAK_CATEGORY_THRESHOLDS_MS: Record<SoakCategory, number> = {
  "ordinary-api": 500,
  realtime: 500,
  "voice-context": 300,
  "webhook-durable-response": 1000,
  "outbox-dispatch": 2000,
};

export type SoakScenario = {
  name: string;
  path: string;
  expectedStatus?: number;
  cookieEnv?: string;
  fixtureSize: number;
  category?: SoakCategory;
  targetMs?: number;
};

export type SoakRunnerConfig = {
  environment: "local" | "staging";
  baseUrl: string;
  scenarios: SoakScenario[];
  concurrency?: number[];
  warmupSeconds?: number;
  durationSeconds?: number;
  soakSeconds?: number;
  timeoutMs?: number;
};

export type MetricPercentiles = { p50: number | null; p95: number | null; p99: number | null };

export type SoakResultRow = {
  scenario: string;
  fixtureSize: number;
  concurrency: number;
  phase: string;
  sampleCount: number;
  errors: number;
  throughputPerSecond: number;
  bytes: number;
  all: MetricPercentiles;
  successful: MetricPercentiles;
  statuses: Record<string, number>;
};

export type SoakResultsFile = { results: SoakResultRow[] };

export type HealthTarget = { name: string; url: string; expectedStatus: number; targetMs: number };
export type HealthTargetResult = MetricPercentiles & { statuses: number[] };

export type ThresholdMiss = {
  target: string;
  metric: "p95" | "status" | "runner";
  observed: number | null;
  limit: number;
  detail: string;
};

export type SoakEvidence = {
  schemaVersion: 1;
  kind: "soak-certification";
  runId: string;
  generatedAt: string;
  releaseCertified: false;
  owner: "UNASSIGNED";
  reviewer: "UNASSIGNED";
  status: "blocked" | "failed" | "passed";
  statusDetail: string;
  target: {
    label: string;
    deploymentId: string;
    targetIdentity: string;
    adminBaseUrl: string;
    workerBaseUrl: string;
    voiceBaseUrl: string;
  };
  configuration: {
    soakSeconds: number;
    scenarioNames: string[];
    concurrency: number[] | null;
    sessionCookie: "provided" | "missing";
  };
  health: {
    concurrency: number;
    targets: Record<string, HealthTargetResult>;
    thresholdMisses: ThresholdMiss[];
  };
  soak: {
    runnerExitCode: number | null;
    resultCount: number;
    targets: Record<string, MetricPercentiles>;
    thresholdMisses: ThresholdMiss[];
  };
  perTarget: Record<string, MetricPercentiles & { source: "health" | "soak" }>;
  checks: string[];
};

export type SoakRunner = (
  configPath: string,
  outputDir: string,
  environment: NodeJS.ProcessEnv,
) => Promise<{ exitCode: number; output: string }>;

export type HealthMeasurer = (
  targets: HealthTarget[],
  concurrency: number,
  environment: NodeJS.ProcessEnv,
) => Promise<Record<string, HealthTargetResult>>;

export type SoakCertificationOptions = {
  config?: SoakRunnerConfig;
  configPath?: string;
  environment?: NodeJS.ProcessEnv;
  runId?: string;
  outputDir?: string;
  runner?: SoakRunner;
  healthMeasurer?: HealthMeasurer;
  now?: () => Date;
};

const PRODUCTION_MARKER = /(^|[^a-z0-9])(production|prod|prd)\d*([^a-z0-9]|$)/i;

export function urlIsLocal(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      hostname === "0.0.0.0" ||
      hostname.startsWith("127.") ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local")
    );
  } catch {
    return true;
  }
}

export function hasProductionMarker(value: string): boolean {
  return PRODUCTION_MARKER.test(value);
}

export function urlHasProductionMarker(value: string): boolean {
  try {
    return hasProductionMarker(new URL(value).hostname);
  } catch {
    return true;
  }
}

function originProblem(name: string, value: string): string | null {
  if (!value.trim()) return `${name} (required)`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return `${name} (must be an absolute HTTP(S) URL)`;
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    return `${name} (must be an HTTP(S) origin without credentials)`;
  }
  if (urlIsLocal(value)) return `${name} (must not be local)`;
  if (urlHasProductionMarker(value)) return `${name} (must not reference production)`;
  return null;
}

export function validateSoakEnvironment(environment: NodeJS.ProcessEnv): string[] {
  const problems: string[] = [];
  for (const name of ["ADMIN_BASE_URL", "WORKER_BASE_URL", "VOICE_BASE_URL"] as const) {
    const value = environment[name]?.trim();
    if (!value) {
      problems.push(`${name} (required)`);
      continue;
    }
    const problem = originProblem(name, value);
    if (problem) problems.push(problem);
  }
  if (!environment.PERFORMANCE_SESSION_COOKIE?.trim()) problems.push("PERFORMANCE_SESSION_COOKIE (required)");
  if (!environment.PERFORMANCE_DEPLOYMENT_ID?.trim()) problems.push("PERFORMANCE_DEPLOYMENT_ID (required)");
  const soakSeconds = environment.PERFORMANCE_SOAK_SECONDS?.trim();
  if (!soakSeconds) problems.push("PERFORMANCE_SOAK_SECONDS (required)");
  else if (!Number.isFinite(Number(soakSeconds)) || Number(soakSeconds) < MINIMUM_SOAK_SECONDS) {
    problems.push(`PERFORMANCE_SOAK_SECONDS (must be >= ${MINIMUM_SOAK_SECONDS})`);
  }
  return [...new Set(problems)];
}

export function effectiveSoakSeconds(config: SoakRunnerConfig, environment: NodeJS.ProcessEnv): number {
  if (typeof config.soakSeconds === "number" && Number.isFinite(config.soakSeconds)) {
    return config.soakSeconds;
  }
  const fromEnv = environment.PERFORMANCE_SOAK_SECONDS?.trim();
  if (fromEnv && Number.isFinite(Number(fromEnv))) return Number(fromEnv);
  return MINIMUM_SOAK_SECONDS;
}

function scenarioLabel(scenario: SoakScenario): string {
  return typeof scenario.name === "string" && scenario.name ? scenario.name : "unnamed";
}

export function validateSoakConfig(config: SoakRunnerConfig, environment: NodeJS.ProcessEnv): string[] {
  const problems: string[] = [];
  if (!["local", "staging"].includes(config.environment)) {
    problems.push("config.environment (must be local or staging)");
  }
  if (config.environment === "local") problems.push("config.environment (must be staging; local targets are refused)");
  const baseUrl = typeof config.baseUrl === "string" ? config.baseUrl.trim() : "";
  if (!baseUrl) problems.push("config.baseUrl (required)");
  else {
    const problem = originProblem("config.baseUrl", baseUrl);
    if (problem) problems.push(problem);
  }
  const scenarios = Array.isArray(config.scenarios) ? config.scenarios : [];
  if (!scenarios.length) problems.push("config.scenarios (at least one scenario is required)");
  let authenticated = false;
  for (const scenario of scenarios) {
    const label = scenarioLabel(scenario);
    if (!/^[a-z0-9-]+$/.test(label)) problems.push(`config.scenarios[${label}] (safe lowercase kebab-case name required)`);
    if (typeof scenario.path !== "string" || !scenario.path.startsWith("/")) {
      problems.push(`config.scenarios[${label}] (path must start with /)`);
    } else if (baseUrl) {
      try {
        if (new URL(scenario.path, baseUrl).origin !== new URL(baseUrl).origin) {
          problems.push(`config.scenarios[${label}] (path must be same-origin)`);
        }
      } catch {
        problems.push(`config.scenarios[${label}] (invalid path or baseUrl)`);
      }
    }
    if (scenario.cookieEnv) {
      authenticated = true;
      if (!environment[scenario.cookieEnv]?.trim()) {
        problems.push(`config.scenarios[${label}] (missing cookie environment ${scenario.cookieEnv})`);
      }
    }
    if (scenario.category !== undefined && !(scenario.category in SOAK_CATEGORY_THRESHOLDS_MS)) {
      problems.push(`config.scenarios[${label}] (unknown category)`);
    }
    if (scenario.fixtureSize !== undefined && (!Number.isInteger(scenario.fixtureSize) || scenario.fixtureSize < 0)) {
      problems.push(`config.scenarios[${label}] (fixtureSize must be a non-negative integer)`);
    }
  }
  if (scenarios.length && !authenticated) {
    problems.push("config.scenarios (at least one authenticated scenario with cookieEnv is required)");
  }
  const soakSeconds = effectiveSoakSeconds(config, environment);
  if (!Number.isFinite(soakSeconds) || soakSeconds < MINIMUM_SOAK_SECONDS) {
    problems.push(`config.soakSeconds (must be >= ${MINIMUM_SOAK_SECONDS})`);
  }
  if (config.concurrency !== undefined && (!Array.isArray(config.concurrency) || !config.concurrency.length || config.concurrency.some((value) => !Number.isInteger(value) || value < 1 || value > 100))) {
    problems.push("config.concurrency (integers between 1 and 100)");
  }
  for (const [name, value] of [["warmupSeconds", config.warmupSeconds], ["durationSeconds", config.durationSeconds], ["timeoutMs", config.timeoutMs]] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) problems.push(`config.${name} (must be a non-negative number)`);
  }
  return [...new Set(problems)];
}

export function healthTargets(adminBaseUrl: string, workerBaseUrl: string, voiceBaseUrl: string): HealthTarget[] {
  const trim = (value: string) => value.replace(/\/+$/, "");
  return [
    { name: "admin-live", url: `${trim(adminBaseUrl)}/api/health/live`, expectedStatus: 200, targetMs: 500 },
    { name: "admin-ready", url: `${trim(adminBaseUrl)}/api/health/ready`, expectedStatus: 200, targetMs: 500 },
    { name: "worker-live", url: `${trim(workerBaseUrl)}/health/live`, expectedStatus: 200, targetMs: 500 },
    { name: "worker-ready", url: `${trim(workerBaseUrl)}/health/ready`, expectedStatus: 200, targetMs: 500 },
    { name: "voice-live", url: `${trim(voiceBaseUrl)}/health/live`, expectedStatus: 200, targetMs: 300 },
    { name: "voice-ready", url: `${trim(voiceBaseUrl)}/health/ready`, expectedStatus: 200, targetMs: 300 },
  ];
}

export function healthConcurrency(environment: NodeJS.ProcessEnv): number {
  return Math.max(5, Math.min(100, Number(environment.PERFORMANCE_CONCURRENCY ?? DEFAULT_HEALTH_CONCURRENCY)));
}

export function evaluateSoakThresholds(rows: SoakResultRow[], config: SoakRunnerConfig): ThresholdMiss[] {
  const misses: ThresholdMiss[] = [];
  const byName = new Map<string, SoakScenario>();
  for (const scenario of config.scenarios) byName.set(scenario.name, scenario);
  for (const row of rows) {
    const scenario = byName.get(row.scenario);
    const limit = scenario?.targetMs ?? (scenario?.category ? SOAK_CATEGORY_THRESHOLDS_MS[scenario.category] : undefined);
    if (limit === undefined) continue;
    const observed = row.successful.p95 ?? row.all.p95;
    if (observed !== null && observed >= limit) {
      misses.push({
        target: `${row.scenario}:${row.phase}`,
        metric: "p95",
        observed,
        limit,
        detail: `${row.scenario} ${row.phase} p95 ${observed.toFixed(1)} ms >= ${limit} ms`,
      });
    }
  }
  return misses;
}

export function collectSoakTargets(rows: SoakResultRow[]): Record<string, MetricPercentiles> {
  const targets: Record<string, MetricPercentiles> = {};
  for (const row of rows) targets[row.scenario] = row.successful;
  return targets;
}

export function evaluateHealthThresholds(
  targets: HealthTarget[],
  results: Record<string, HealthTargetResult>,
): ThresholdMiss[] {
  const misses: ThresholdMiss[] = [];
  for (const target of targets) {
    const result = results[target.name];
    if (!result) {
      misses.push({ target: target.name, metric: "runner", observed: null, limit: target.targetMs, detail: `${target.name} produced no samples` });
      continue;
    }
    if (result.statuses.some((status) => status !== target.expectedStatus)) {
      misses.push({ target: target.name, metric: "status", observed: null, limit: target.targetMs, detail: `${target.name} statuses ${result.statuses.join(",")} != ${target.expectedStatus}` });
    }
    if (result.p95 !== null && result.p95 >= target.targetMs) {
      misses.push({ target: target.name, metric: "p95", observed: result.p95, limit: target.targetMs, detail: `${target.name} p95 ${result.p95.toFixed(1)} ms >= ${target.targetMs} ms` });
    }
  }
  return misses;
}

export type SoakCliOptions = { configPath: string; evidencePath?: string; outputDir?: string };

export function parseSoakArgs(args: string[]): SoakCliOptions {
  let configPath: string | undefined;
  let evidencePath: string | undefined;
  let outputDir: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--config") {
      const value = args[index + 1];
      if (!value) throw new Error("--config requires a file path.");
      configPath = value;
      index += 1;
    } else if (argument === "--evidence") {
      const value = args[index + 1];
      if (!value) throw new Error("--evidence requires a file path.");
      evidencePath = value;
      index += 1;
    } else if (argument === "--output") {
      const value = args[index + 1];
      if (!value) throw new Error("--output requires a directory path.");
      outputDir = value;
      index += 1;
    } else {
      throw new Error(`Unknown soak-certification option: ${argument}.`);
    }
  }
  if (!configPath) throw new Error("--config <run-config.json> is required.");
  return { configPath, ...(evidencePath ? { evidencePath } : {}), ...(outputDir ? { outputDir } : {}) };
}

export async function writeSoakEvidence(filePath: string, evidence: SoakEvidence): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await chmod(filePath, 0o600);
}

async function defaultRunSoak(
  configPath: string,
  outputDir: string,
  environment: NodeJS.ProcessEnv,
): Promise<{ exitCode: number; output: string }> {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(
      "pnpm",
      ["exec", "tsx", "--tsconfig", "tsconfig.base.json", "scripts/performance/run.ts", configPath, outputDir],
      { cwd: resolve(import.meta.dirname, "..", ".."), env: environment, stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => { const text = chunk.toString(); output += text; process.stdout.write(text); });
    child.stderr.on("data", (chunk: Buffer) => { const text = chunk.toString(); output += text; process.stderr.write(text); });
    child.once("error", reject);
    child.once("close", (code) => resolvePromise({ exitCode: code ?? 1, output }));
  });
}

async function defaultMeasureHealth(
  targets: HealthTarget[],
  concurrency: number,
  _environment: NodeJS.ProcessEnv,
): Promise<Record<string, HealthTargetResult>> {
  const results: Record<string, HealthTargetResult> = {};
  for (const target of targets) {
    const durations: number[] = [];
    const statuses = new Set<number>();
    await Promise.all(Array.from({ length: concurrency }, async () => {
      const startedAt = performance.now();
      try {
        const response = await fetch(target.url, { cache: "no-store" });
        statuses.add(response.status);
        if (response.body) {
          const reader = response.body.getReader();
          try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; } } finally { reader.releaseLock(); }
        }
      } catch {
        statuses.add(0);
      }
      durations.push(performance.now() - startedAt);
    }));
    results[target.name] = {
      p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      p99: percentile(durations, 0.99),
      statuses: [...statuses],
    };
  }
  return results;
}

function targetIdentity(environment: NodeJS.ProcessEnv): string {
  const source = [
    environment.ADMIN_BASE_URL,
    environment.WORKER_BASE_URL,
    environment.VOICE_BASE_URL,
    environment.PERFORMANCE_DEPLOYMENT_ID,
  ].join("|");
  return `isolated-soak:${createHash("sha256").update(source).digest("hex").slice(0, 16)}`;
}

export async function runSoakCertification(options: SoakCertificationOptions = {}): Promise<SoakEvidence> {
  const environment = options.environment ? { ...process.env, ...options.environment } : process.env;
  const runId = options.runId ?? (environment.PERFORMANCE_RUN_ID?.trim() || randomUUID());
  const generatedAt = (options.now ?? (() => new Date()))().toISOString();
  const config = options.config;
  const problems = validateSoakEnvironment(environment);
  if (!config) problems.push("config (run config could not be read)");
  else problems.push(...validateSoakConfig(config, environment));

  const evidence: SoakEvidence = {
    schemaVersion: 1,
    kind: "soak-certification",
    runId,
    generatedAt,
    releaseCertified: false,
    owner: "UNASSIGNED",
    reviewer: "UNASSIGNED",
    status: "blocked",
    statusDetail: "",
    target: {
      label: environment.PERFORMANCE_TARGET_LABEL?.trim() || "unlabeled",
      deploymentId: environment.PERFORMANCE_DEPLOYMENT_ID?.trim() || "unset",
      targetIdentity: targetIdentity(environment),
      adminBaseUrl: environment.ADMIN_BASE_URL ?? "unset",
      workerBaseUrl: environment.WORKER_BASE_URL ?? "unset",
      voiceBaseUrl: environment.VOICE_BASE_URL ?? "unset",
    },
    configuration: {
      soakSeconds: config ? effectiveSoakSeconds(config, environment) : 0,
      scenarioNames: config?.scenarios.map((scenario) => scenario.name) ?? [],
      concurrency: config?.concurrency ?? null,
      sessionCookie: environment.PERFORMANCE_SESSION_COOKIE?.trim() ? "provided" : "missing",
    },
    health: { concurrency: healthConcurrency(environment), targets: {}, thresholdMisses: [] },
    soak: { runnerExitCode: null, resultCount: 0, targets: {}, thresholdMisses: [] },
    perTarget: {},
    checks: [
      ...Object.entries(SOAK_CATEGORY_THRESHOLDS_MS).map(([category, limit]) => `${category} p95 < ${limit} ms`),
      "admin/worker health p95 < 500 ms",
      "voice health p95 < 300 ms",
    ],
  };

  if (problems.length) {
    evidence.status = "blocked";
    evidence.statusDetail = `Configuration rejected: ${problems.join("; ")}`;
    evidence.checks = [...evidence.checks, ...problems];
    return evidence;
  }

  // config is guaranteed here by the problems check above.
  const runConfig = config!;
  const outputDir = resolve(options.outputDir ?? join(tmpdir(), "lobbystack-soak-certification", runId));
  const runner = options.runner ?? defaultRunSoak;
  const healthMeasurer = options.healthMeasurer ?? defaultMeasureHealth;

  const configPath = options.configPath ?? join(outputDir, "run-config.json");
  let run: { exitCode: number; output: string };
  try {
    run = await runner(resolve(configPath), outputDir, environment);
  } catch (error) {
    run = { exitCode: 1, output: error instanceof Error ? error.message : String(error) };
  }
  evidence.soak.runnerExitCode = run.exitCode;

  let results: SoakResultsFile | null = null;
  try {
    results = JSON.parse(await readFile(join(outputDir, "results.json"), "utf8")) as SoakResultsFile;
  } catch {
    results = null;
  }
  const rows = results?.results ?? [];
  evidence.soak.resultCount = rows.length;
  evidence.soak.targets = collectSoakTargets(rows);
  evidence.soak.thresholdMisses = evaluateSoakThresholds(rows, runConfig);

  const targets = healthTargets(evidence.target.adminBaseUrl, evidence.target.workerBaseUrl, evidence.target.voiceBaseUrl);
  let healthResults: Record<string, HealthTargetResult> = {};
  try {
    healthResults = await healthMeasurer(targets, evidence.health.concurrency, environment);
  } catch {
    healthResults = {};
  }
  evidence.health.targets = healthResults;
  evidence.health.thresholdMisses = evaluateHealthThresholds(targets, healthResults);

  const perTarget: Record<string, MetricPercentiles & { source: "health" | "soak" }> = {};
  for (const [name, result] of Object.entries(healthResults)) {
    perTarget[`health:${name}`] = { p50: result.p50, p95: result.p95, p99: result.p99, source: "health" };
  }
  for (const [name, result] of Object.entries(evidence.soak.targets)) {
    perTarget[`soak:${name}`] = { p50: result.p50, p95: result.p95, p99: result.p99, source: "soak" };
  }
  evidence.perTarget = perTarget;

  const misses = [...evidence.soak.thresholdMisses, ...evidence.health.thresholdMisses];
  const failed = run.exitCode !== 0 || results === null || misses.length > 0;
  evidence.status = failed ? "failed" : "passed";
  evidence.statusDetail = failed
    ? `Soak not certified: ${[
        run.exitCode !== 0 ? `runner exit ${run.exitCode}` : null,
        results === null ? "missing results.json" : null,
        ...misses.map((miss) => miss.detail),
      ].filter(Boolean).join("; ")}`
    : "All soak and health thresholds satisfied. Release remains uncertified (releaseCertified:false).";
  return evidence;
}

async function readConfig(configPath: string): Promise<SoakRunnerConfig | undefined> {
  try {
    return JSON.parse(await readFile(resolve(configPath), "utf8")) as SoakRunnerConfig;
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const options = parseSoakArgs(process.argv.slice(2));
  const config = await readConfig(options.configPath);
  const evidence = await runSoakCertification({
    configPath: options.configPath,
    ...(config ? { config } : {}),
    ...(options.outputDir ? { outputDir: options.outputDir } : {}),
  });
  if (options.evidencePath) await writeSoakEvidence(options.evidencePath, evidence);
  console.log(JSON.stringify(evidence));
  if (evidence.status !== "passed") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
