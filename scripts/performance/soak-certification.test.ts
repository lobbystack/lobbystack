import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MINIMUM_SOAK_SECONDS,
  SOAK_CATEGORY_THRESHOLDS_MS,
  collectSoakTargets,
  effectiveSoakSeconds,
  evaluateHealthThresholds,
  evaluateSoakThresholds,
  hasProductionMarker,
  healthConcurrency,
  healthTargets,
  parseSoakArgs,
  urlIsLocal,
  validateSoakConfig,
  validateSoakEnvironment,
  writeSoakEvidence,
  type HealthTargetResult,
  type SoakEvidence,
  type SoakResultRow,
  type SoakRunnerConfig,
} from "./soak-certification";

const validEnvironment: NodeJS.ProcessEnv = {
  ADMIN_BASE_URL: "https://admin.certification.example",
  WORKER_BASE_URL: "https://worker.certification.example",
  VOICE_BASE_URL: "https://voice.certification.example",
  PERFORMANCE_SESSION_COOKIE: "session=opaque",
  PERFORMANCE_DEPLOYMENT_ID: "deploy-42",
  PERFORMANCE_SOAK_SECONDS: "1800",
};

const validConfig: SoakRunnerConfig = {
  environment: "staging",
  baseUrl: "https://admin.certification.example",
  soakSeconds: 1800,
  concurrency: [10, 30],
  scenarios: [
    { name: "ordinary-api", path: "/api/dashboard", cookieEnv: "PERFORMANCE_SESSION_COOKIE", fixtureSize: 1000, category: "ordinary-api" },
    { name: "voice-context", path: "/voice/context", cookieEnv: "PERFORMANCE_SESSION_COOKIE", fixtureSize: 1000, category: "voice-context" },
  ],
};

function row(overrides: Partial<SoakResultRow>): SoakResultRow {
  return {
    scenario: "ordinary-api",
    fixtureSize: 1000,
    concurrency: 30,
    phase: "soak",
    sampleCount: 100,
    errors: 0,
    throughputPerSecond: 10,
    bytes: 1024,
    all: { p50: 10, p95: 20, p99: 30 },
    successful: { p50: 9, p95: 18, p99: 25 },
    statuses: { "200": 100 },
    ...overrides,
  };
}

function evidenceFixture(): SoakEvidence {
  return {
    schemaVersion: 1,
    kind: "soak-certification",
    runId: "run-1",
    generatedAt: new Date(0).toISOString(),
    releaseCertified: false,
    owner: "UNASSIGNED",
    reviewer: "UNASSIGNED",
    status: "blocked",
    statusDetail: "blocked",
    target: {
      label: "isolated",
      deploymentId: "deploy-42",
      targetIdentity: "isolated-soak:abc",
      adminBaseUrl: validEnvironment.ADMIN_BASE_URL!,
      workerBaseUrl: validEnvironment.WORKER_BASE_URL!,
      voiceBaseUrl: validEnvironment.VOICE_BASE_URL!,
    },
    configuration: { soakSeconds: 1800, scenarioNames: ["ordinary-api"], concurrency: [30], sessionCookie: "provided" },
    health: { concurrency: 30, targets: {}, thresholdMisses: [] },
    soak: { runnerExitCode: null, resultCount: 0, targets: {}, thresholdMisses: [] },
    perTarget: {},
    checks: [],
  };
}

describe("soak certification guards", () => {
  it("refuses local hosts and production markers", () => {
    expect(urlIsLocal("http://127.0.0.1:13000")).toBe(true);
    expect(urlIsLocal("http://localhost:13000")).toBe(true);
    expect(urlIsLocal("https://admin.certification.example")).toBe(false);
    expect(hasProductionMarker("production")).toBe(true);
    expect(hasProductionMarker("prod-eu")).toBe(true);
    expect(hasProductionMarker("prd01")).toBe(true);
    expect(hasProductionMarker("product-staging")).toBe(false);
  });

  it("accepts a non-local isolated environment and rejects missing or unsafe values", () => {
    expect(validateSoakEnvironment(validEnvironment)).toEqual([]);
    expect(validateSoakEnvironment({ ...validEnvironment, PERFORMANCE_SESSION_COOKIE: "" })).toContain("PERFORMANCE_SESSION_COOKIE (required)");
    expect(validateSoakEnvironment({ ...validEnvironment, PERFORMANCE_DEPLOYMENT_ID: "" })).toContain("PERFORMANCE_DEPLOYMENT_ID (required)");
    expect(validateSoakEnvironment({ ...validEnvironment, ADMIN_BASE_URL: "http://localhost:13000" })).toContain("ADMIN_BASE_URL (must not be local)");
    expect(validateSoakEnvironment({ ...validEnvironment, VOICE_BASE_URL: "https://voice.production.example" })).toContain("VOICE_BASE_URL (must not reference production)");
    expect(validateSoakEnvironment({ ...validEnvironment, WORKER_BASE_URL: "postgres://db.example" })).toContain("WORKER_BASE_URL (must be an HTTP(S) origin without credentials)");
    expect(validateSoakEnvironment({ ...validEnvironment, PERFORMANCE_SOAK_SECONDS: "600" })).toContain(`PERFORMANCE_SOAK_SECONDS (must be >= ${MINIMUM_SOAK_SECONDS})`);
  });

  it("rejects local or malformed runner configuration", () => {
    expect(validateSoakConfig(validConfig, validEnvironment)).toEqual([]);
    expect(validateSoakConfig({ ...validConfig, environment: "local" }, validEnvironment)).toContain("config.environment (must be staging; local targets are refused)");
    expect(validateSoakConfig({ ...validConfig, baseUrl: "http://127.0.0.1:13000" }, validEnvironment)).toContain("config.baseUrl (must not be local)");
    expect(validateSoakConfig({ ...validConfig, soakSeconds: 900 }, validEnvironment)).toContain(`config.soakSeconds (must be >= ${MINIMUM_SOAK_SECONDS})`);
    expect(validateSoakConfig({ ...validConfig, scenarios: [{ name: "Bad Name", path: "relative", fixtureSize: 1 }] }, validEnvironment)).toEqual(
      expect.arrayContaining([
        "config.scenarios[Bad Name] (safe lowercase kebab-case name required)",
        "config.scenarios[Bad Name] (path must start with /)",
      ]),
    );
    expect(validateSoakConfig({ ...validConfig, scenarios: [{ name: "cross", path: "//other.example/x", cookieEnv: "PERFORMANCE_SESSION_COOKIE", fixtureSize: 1 }] }, validEnvironment)).toContain("config.scenarios[cross] (path must be same-origin)");
    const unauthenticated = validConfig.scenarios.map(({ name, path, fixtureSize, category }) => ({ name, path, fixtureSize, ...(category ? { category } : {}) }));
    expect(validateSoakConfig({ ...validConfig, scenarios: unauthenticated }, validEnvironment)).toContain("config.scenarios (at least one authenticated scenario with cookieEnv is required)");
    expect(validateSoakConfig({ ...validConfig, scenarios: [{ name: "api", path: "/api", cookieEnv: "MISSING_COOKIE", fixtureSize: 1 }] }, validEnvironment)).toContain("config.scenarios[api] (missing cookie environment MISSING_COOKIE)");
  });

  it("resolves the effective soak duration without exceeding the minimum", () => {
    const { soakSeconds: _omitted, ...withoutSoakSeconds } = validConfig;
    expect(effectiveSoakSeconds(validConfig, validEnvironment)).toBe(1800);
    expect(effectiveSoakSeconds(withoutSoakSeconds, { ...validEnvironment, PERFORMANCE_SOAK_SECONDS: "2400" })).toBe(2400);
    expect(effectiveSoakSeconds(withoutSoakSeconds, {})).toBe(MINIMUM_SOAK_SECONDS);
  });

  it("parses CLI options and refuses unknown flags", () => {
    expect(parseSoakArgs(["--config", "run.json"])).toEqual({ configPath: "run.json" });
    expect(parseSoakArgs(["--config", "run.json", "--evidence", "out.json", "--output", "/tmp/out"])).toEqual({ configPath: "run.json", evidencePath: "out.json", outputDir: "/tmp/out" });
    expect(() => parseSoakArgs(["--evidence", "out.json"])).toThrow("--config <run-config.json> is required.");
    expect(() => parseSoakArgs(["--config"])).toThrow("--config requires a file path.");
    expect(() => parseSoakArgs(["--config", "run.json", "--bogus"])).toThrow("Unknown soak-certification option: --bogus.");
  });
});

describe("soak threshold evaluation", () => {
  it("flags scenarios that exceed their category threshold and ignores healthy rows", () => {
    const misses = evaluateSoakThresholds(
      [row({ scenario: "ordinary-api", successful: { p50: 300, p95: 650, p99: 900 } }), row({ scenario: "voice-context", successful: { p50: 100, p95: 200, p99: 250 } })],
      validConfig,
    );
    expect(misses).toHaveLength(1);
    expect(misses[0]).toMatchObject({ target: "ordinary-api:soak", metric: "p95", limit: SOAK_CATEGORY_THRESHOLDS_MS["ordinary-api"] });
  });

  it("collects successful percentiles per scenario", () => {
    const targets = collectSoakTargets([row({ scenario: "ordinary-api" }), row({ scenario: "voice-context", successful: { p50: 1, p95: 2, p99: 3 } })]);
    expect(targets["voice-context"]).toEqual({ p50: 1, p95: 2, p99: 3 });
  });

  it("applies the replacement-performance-check health thresholds with p95 and status", () => {
    const targets = healthTargets(validEnvironment.ADMIN_BASE_URL!, validEnvironment.WORKER_BASE_URL!, validEnvironment.VOICE_BASE_URL!);
    const results: Record<string, HealthTargetResult> = {};
    for (const target of targets) results[target.name] = { p50: 5, p95: 10, p99: 20, statuses: [200] };
    expect(evaluateHealthThresholds(targets, results)).toEqual([]);

    results["voice-ready"] = { p50: 5, p95: 320, p99: 400, statuses: [200] };
    results["admin-live"] = { p50: 5, p95: 10, p99: 20, statuses: [503] };
    const misses = evaluateHealthThresholds(targets, results);
    expect(misses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: "voice-ready", metric: "p95", limit: 300 }),
        expect.objectContaining({ target: "admin-live", metric: "status" }),
      ]),
    );
  });

  it("keeps health concurrency within the documented range", () => {
    expect(healthConcurrency({})).toBe(30);
    expect(healthConcurrency({ PERFORMANCE_CONCURRENCY: "2" })).toBe(5);
    expect(healthConcurrency({ PERFORMANCE_CONCURRENCY: "500" })).toBe(100);
  });
});

describe("soak evidence", () => {
  it("writes owner-only, non-overwritable evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "soak-certification-test-"));
    const file = join(directory, "evidence.json");
    try {
      await writeSoakEvidence(file, evidenceFixture());
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      await expect(writeSoakEvidence(file, evidenceFixture())).rejects.toMatchObject({ code: "EEXIST" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("marks the evidence as uncertified with unassigned ownership", () => {
    expect(evidenceFixture()).toMatchObject({ releaseCertified: false, owner: "UNASSIGNED", reviewer: "UNASSIGNED" });
  });
});
