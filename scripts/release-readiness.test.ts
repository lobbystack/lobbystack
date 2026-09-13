import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  assertPlaywrightReport,
  e2eConfigurationProblems,
  fullE2eEnvironment,
  parseReleaseReadinessArgs,
  releaseGates,
  runReleaseReadiness,
  stagingConfigurationProblems,
  writeReleaseEvidence,
} from "./release-readiness";

const stagingEnvironment = {
  RELEASE_CERTIFICATION_TARGET: "isolated-staging",
  ADMIN_BASE_URL: "https://admin.certification.example",
  WORKER_BASE_URL: "https://worker.certification.example",
  VOICE_BASE_URL: "https://voice.certification.example",
  DATABASE_URL: "postgres://lobbystack_migrator:secret@db.certification.example/certification",
  REPLACEMENT_MIGRATOR_DATABASE_URL: "postgres://lobbystack_migrator:secret@db.certification.example/certification",
  REPLACEMENT_APP_DATABASE_URL: "postgres://lobbystack_app:secret@db.certification.example/certification",
  REPLACEMENT_WORKER_DATABASE_URL: "postgres://lobbystack_worker:secret@db.certification.example/certification",
  REDIS_URL: "redis://redis.certification.example:6379",
  REPLACEMENT_REDIS_HOST: "redis.certification.example",
  REDIS_PORT: "6379",
  REPLACEMENT_S3_ENDPOINT: "https://storage.certification.example",
  S3_BUCKET: "certification",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
  POLAR_WEBHOOK_SECRET: "secret",
  TWILIO_AUTH_TOKEN: "secret",
  INTERNAL_SERVICE_SECRET: "secret",
  REPLACEMENT_TEST_BUSINESS_SLUG: "certification-internal",
  RESEND_WEBHOOKS_ENABLED: "false",
};

describe("release readiness", () => {
  it("separates the deterministic baseline, optional fixture E2E, and staging gates", () => {
    expect(releaseGates("local").map((gate) => gate.id)).toEqual(["lint", "typecheck", "test", "build"]);
    expect(releaseGates("local", true).at(-1)?.id).toBe("playwright-functional-fixtures");
    expect(releaseGates("local", true).map((gate) => gate.id)).toContain("calendar-booking");
    expect(releaseGates("staging").map((gate) => gate.id)).toContain("privacy");
  });

  it("plans without reading configuration or executing commands", async () => {
    const execute = vi.fn();
    const result = await runReleaseReadiness({ mode: "staging", plan: true, environment: {}, runId: "run-1", gitSha: "sha-1", execute });
    expect(result.status).toBe("planned");
    expect(result.scope.releaseCertified).toBe(false);
    expect(result.scope.resendWebhooks).toBe("unverified");
    expect(result.gates).toHaveLength(7);
    expect(execute).not.toHaveBeenCalled();
  });

  it("fails staging closed and records every unrun gate", async () => {
    const execute = vi.fn();
    const result = await runReleaseReadiness({ mode: "staging", environment: {}, runId: "run-1", gitSha: "sha-1", execute });
    expect(result.status).toBe("failed");
    expect(result.gates.every((gate) => gate.status === "not-run")).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects local staging endpoints, non-certification databases, and role mismatches", () => {
    expect(stagingConfigurationProblems(stagingEnvironment)).toEqual([]);
    expect(stagingConfigurationProblems({ ...stagingEnvironment, ADMIN_BASE_URL: "http://127.0.0.1:13000" })).toContain("ADMIN_BASE_URL (must not be local)");
    expect(stagingConfigurationProblems({ ...stagingEnvironment, REPLACEMENT_WORKER_DATABASE_URL: "postgres://lobbystack_app:secret@db.example/production" }))
      .toEqual(expect.arrayContaining(["REPLACEMENT_WORKER_DATABASE_URL (must target a non-local certification database)", "REPLACEMENT_WORKER_DATABASE_URL (must use lobbystack_worker)"]));
    expect(stagingConfigurationProblems({ ...stagingEnvironment, RESEND_WEBHOOKS_ENABLED: "true" })).toContain("RESEND_WEBHOOK_SECRET (required when Resend webhooks are enabled)");
    expect(stagingConfigurationProblems({ ...stagingEnvironment, ADMIN_BASE_URL: "http://[::1]:13000" })).toContain("ADMIN_BASE_URL (must not be local)");
    expect(stagingConfigurationProblems({ ...stagingEnvironment, DATABASE_URL: "postgres://user:secret@db.example/production_certification" })).not.toEqual([]);
    expect(stagingConfigurationProblems({ ...stagingEnvironment, REPLACEMENT_WORKER_DATABASE_URL: "postgres://lobbystack_worker:secret@other.example/certification" })).toContain("Staging role databases (must target the same disposable database)");
  });

  it("passes the supplied environment to executors and redacts it from evidence", async () => {
    const execute = vi.fn(async (_gate, environment) => {
      expect(environment.INTERNAL_SERVICE_SECRET).toBe("super-secret-value");
      expect(environment.RESEND_WEBHOOK_SECRET).toBeUndefined();
      expect(environment.TSX_TSCONFIG_PATH).toBeUndefined();
      return { exitCode: 0, output: "ok" };
    });
    const result = await runReleaseReadiness({ mode: "staging", environment: { ...stagingEnvironment, INTERNAL_SERVICE_SECRET: "super-secret-value", RESEND_WEBHOOK_SECRET: "must-not-run", TSX_TSCONFIG_PATH: "scripts/tsconfig.json" }, runId: "run-1", gitSha: "sha-1", execute });
    expect(result.status).toBe("passed");
    expect(JSON.stringify(result)).not.toContain("super-secret-value");
    expect(result.scope.resendWebhooks).toBe("disabled");
    expect(result.gates.every((gate) => gate.startedAt && gate.finishedAt && gate.durationMs !== null && gate.outputDigest)).toBe(true);
  });

  it("converts executor errors into failed and not-run evidence", async () => {
    const result = await runReleaseReadiness({ mode: "local", runId: "run-1", gitSha: "sha-1", execute: async () => { throw new Error("spawn failed"); } });
    expect(result.gates[0]).toMatchObject({ id: "lint", commandName: "lint", status: "failed", startedAt: expect.any(String), finishedAt: expect.any(String), durationMs: expect.any(Number), outputDigest: null });
    expect(result.gates.slice(1).every((gate) => gate.status === "not-run")).toBe(true);
  });

  it("writes non-overwritable owner-only evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "release-readiness-test-"));
    const file = join(directory, "evidence.json");
    try {
      const result = await runReleaseReadiness({ plan: true, runId: "run-1", gitSha: "sha-1" });
      await writeReleaseEvidence(file, result);
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      await expect(writeReleaseEvidence(file, result)).rejects.toMatchObject({ code: "EEXIST" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("uses Playwright JSON results rather than console text", () => {
    expect(() => assertPlaywrightReport({ suites: [{ specs: [{ tests: [{ status: "expected", results: [{ status: "passed" }] }] }] }] })).not.toThrow();
    expect(() => assertPlaywrightReport({ suites: [{ specs: [{ tests: [{ status: "skipped", results: [] }] }] }] })).toThrow("skipped=1");
    expect(() => assertPlaywrightReport({ suites: [{ specs: [{ tests: [{ status: "flaky", results: [{ status: "failed" }, { status: "passed" }] }] }] }] })).toThrow("flaky=1");
    expect(() => assertPlaywrightReport({ suites: [{ specs: [{ tests: [{ status: "unexpected", results: [{ status: "failed" }] }] }] }] })).toThrow("Every required");
    expect(() => assertPlaywrightReport({ suites: [{ specs: [{ tests: [{ status: "expected", results: [{ status: "timedOut" }, { status: "passed" }] }] }] }] })).toThrow("Every required");
  });

  it("requires the explicit disposable E2E fixture profile", () => {
    expect(e2eConfigurationProblems({})).toContain("REPLACEMENT_E2E_DATABASE_URL");
    expect(e2eConfigurationProblems({
      RELEASE_E2E_WORKER_PAUSED: "1",
      PLAYWRIGHT_BASE_URL: "http://localhost:13000",
      REPLACEMENT_E2E_DATABASE_URL: "postgres://lobbystack_migrator:secret@localhost/e2e",
      LOBBYSTACK_APP_DATABASE_URL: "postgres://lobbystack_app:secret@localhost/e2e",
      LOBBYSTACK_AUTH_DATABASE_URL: "postgres://lobbystack_auth:secret@localhost/e2e",
      LOBBYSTACK_WORKER_DATABASE_URL: "postgres://lobbystack_worker:secret@localhost/other-e2e",
      LOBBYSTACK_DISPATCHER_DATABASE_URL: "postgres://lobbystack_dispatcher:secret@localhost/e2e",
      WIDGET_E2E: "1",
      PASSWORD_RECOVERY_E2E: "1",
      WEBSITE_IMPORT_E2E: "1",
      DEMO_OPERATOR_E2E: "1",
      PARITY_PORT_OPERATOR_STORAGE_STATE_FR: "fr.json",
      PARITY_PORT_OPERATOR_STORAGE_STATE_EN: "en.json",
      PARITY_OPERATOR_USER_ID: "user",
    })).toContain("E2E role databases (must target the same disposable database)");
    expect(parseReleaseReadinessArgs(["--e2e", "--dry-run"])).toEqual({ mode: "local", plan: true, e2e: true, evidencePath: undefined });
    expect(() => parseReleaseReadinessArgs(["--staging", "--e2e"])).toThrow("only for the local baseline");
  });

  it("forces the widget fixture provider instead of inheriting a live provider", () => {
    const environment = fullE2eEnvironment({ REPLACEMENT_E2E_DATABASE_URL: "postgres://lobbystack_migrator:secret@localhost/e2e", AI_CHAT_BASE_URL: "https://paid.example/v1" }, "/tmp/results.json");
    expect(environment).toMatchObject({
      DATABASE_URL: "postgres://lobbystack_migrator:secret@localhost/e2e",
      PLAYWRIGHT_JSON_OUTPUT_FILE: "/tmp/results.json",
      AI_CHAT_API_KEY: "local-widget-certification",
      AI_CHAT_BASE_URL: "http://127.0.0.1:18090/v1",
      AI_CHAT_MODEL: "release-e2e-fixture",
    });
  });
});
