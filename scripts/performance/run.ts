import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { summarize, type Sample } from "./metrics";
import { benchmarkMetadata } from "./metadata";

type Scenario = { name: string; path: string; expectedStatus?: number; cookieEnv?: string; fixtureSize: number };
type Configuration = {
  environment: "local" | "staging";
  baseUrl: string;
  scenarios: Scenario[];
  concurrency?: number[];
  warmupSeconds?: number;
  durationSeconds?: number;
  soakSeconds?: number;
  timeoutMs?: number;
};

const configPath = process.argv[2];
if (!configPath) throw new Error("Usage: tsx scripts/performance/run.ts <config.json> [output-directory]");
const config = JSON.parse(await readFile(configPath, "utf8")) as Configuration;
const base = new URL(config.baseUrl);
if (!["local", "staging"].includes(config.environment) || !["http:", "https:"].includes(base.protocol) || base.username || base.password) throw new Error("Use an explicit local/staging HTTP origin without credentials.");
if (!Array.isArray(config.scenarios) || !config.scenarios.length) throw new Error("At least one named scenario is required.");
for (const scenario of config.scenarios) {
  if (!/^[a-z0-9-]+$/.test(scenario.name) || !scenario.path.startsWith("/") || new URL(scenario.path, base).origin !== base.origin) throw new Error("Scenarios require safe names and same-origin paths.");
  if (scenario.cookieEnv && !process.env[scenario.cookieEnv]) throw new Error(`Missing cookie environment variable for ${scenario.name}.`);
}
const positive = (value: number, name: string) => { if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${name}.`); return value; };
const steps = config.concurrency ?? [1, 10, 30];
if (!steps.length || steps.some(n => !Number.isInteger(n) || n < 1 || n > 100)) throw new Error("Concurrency must be between 1 and 100.");
const warmupMs = positive(config.warmupSeconds ?? 60, "warmup") * 1000;
const durationMs = positive(config.durationSeconds ?? 300, "duration") * 1000;
const soakMs = positive(config.soakSeconds ?? 1800, "soak") * 1000;
const timeoutMs = positive(config.timeoutMs ?? 15000, "timeout");
if (!durationMs || !timeoutMs) throw new Error("Duration and timeout must be positive.");
const output = resolve(process.argv[3] ?? `/tmp/lobbystack-performance/${Date.now()}`);
await mkdir(output, { recursive: true });
const metadata = {
  ...await benchmarkMetadata(config.environment), origin: base.origin,
  providerMode: "not-invoked", artifacts: [] as string[],
};

async function sample(scenario: Scenario): Promise<Sample> {
  const start = performance.now();
  let bytes = 0;
  let status: number | null = null;
  try {
    const response = await fetch(new URL(scenario.path, base), {
      redirect: "manual", signal: AbortSignal.timeout(timeoutMs),
      headers: scenario.cookieEnv ? { cookie: process.env[scenario.cookieEnv]! } : {},
    });
    status = response.status;
    // Measure the full payload, not just time to response headers.
    if (response.body) {
      const reader = response.body.getReader();
      try {
        for (;;) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; }
      } finally { reader.releaseLock(); }
    }
    return { durationMs: performance.now() - start, bytes, status, ok: status === (scenario.expectedStatus ?? 200) };
  } catch { return { durationMs: performance.now() - start, bytes, status, ok: false }; }
}

async function run(scenario: Scenario, concurrency: number, milliseconds: number) {
  const samples: Sample[] = [];
  const start = performance.now();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (performance.now() - start < milliseconds) samples.push(await sample(scenario));
  }));
  return summarize(samples, performance.now() - start);
}

const results: unknown[] = [];
let failed = false;
for (const scenario of config.scenarios) {
  let stableConcurrency: number | undefined;
  for (const concurrency of steps) {
    await run(scenario, concurrency, warmupMs);
    const metrics = await run(scenario, concurrency, durationMs);
    results.push({ scenario: scenario.name, fixtureSize: scenario.fixtureSize, concurrency, phase: "load", ...metrics });
    console.log(JSON.stringify({ scenario: scenario.name, concurrency, ...metrics }));
    await writeFile(resolve(output, "results.json"), JSON.stringify({ ...metadata, results }, null, 2));
    if (metrics.errors || !metrics.sampleCount) { failed = true; break; }
    stableConcurrency = concurrency;
  }
  if (stableConcurrency && soakMs) {
    const metrics = await run(scenario, stableConcurrency, soakMs);
    results.push({ scenario: scenario.name, fixtureSize: scenario.fixtureSize, concurrency: stableConcurrency, phase: "soak", ...metrics });
    failed ||= Boolean(metrics.errors);
  }
}
await writeFile(resolve(output, "results.json"), JSON.stringify({ ...metadata, results }, null, 2));
console.log(`Performance results: ${resolve(output, "results.json")}`);
if (failed) process.exitCode = 1;
