import { describe, expect, it } from "vitest";
import {
  FREEZE_LIMITATIONS,
  actionRequiresExecute,
  assertDeploymentAllowed,
  assertExecuteAllowed,
  buildCanaryExpectation,
  buildFreezeEvidence,
  classifyPauseSignal,
  deploymentHost,
  deploymentScope,
  isFreezeAction,
  isProductionDeployment,
  isValidDeploymentId,
  parseDeploymentId,
  parseFreezeArgs,
  redactText,
  redactUnknown,
  type FreezeStep,
} from "./legacy-freeze.ts";

const DEV_DEPLOYMENT = "dev:valiant-ibis-521";
const PROD_DEPLOYMENT = "prod:determined-reindeer-80";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkZXZlbG9wZXIifQ.c2VjcmV0LXNpZ25hdHVyZQ";
const URL = "https://valiant-ibis-521.convex.cloud/api/v1/pause_deployment";
const KEY = "dev:valiant-ibis-521|0123456789abcdef";

describe("legacy freeze deployment validation", () => {
  it("accepts only well-formed Convex deployment ids", () => {
    expect(isValidDeploymentId(DEV_DEPLOYMENT)).toBe(true);
    expect(isValidDeploymentId(PROD_DEPLOYMENT)).toBe(true);
    expect(isValidDeploymentId("local:test-bed")).toBe(true);
    expect(isValidDeploymentId("valiant-ibis-521")).toBe(false);
    expect(isValidDeploymentId("dev:")).toBe(false);
    expect(isValidDeploymentId("dev:Valiant")).toBe(false);
    expect(isValidDeploymentId("dev:has space")).toBe(false);
    expect(isValidDeploymentId(`${DEV_DEPLOYMENT}|${TOKEN}`)).toBe(false);
    expect(isValidDeploymentId(42)).toBe(false);
    expect(isValidDeploymentId(undefined)).toBe(false);
  });

  it("parses scope and name and derives the control host", () => {
    expect(parseDeploymentId(DEV_DEPLOYMENT)).toEqual({ scope: "dev", name: "valiant-ibis-521" });
    expect(parseDeploymentId("not-a-deployment")).toBeUndefined();
    expect(deploymentScope(PROD_DEPLOYMENT)).toBe("prod");
    expect(isProductionDeployment(PROD_DEPLOYMENT)).toBe(true);
    expect(isProductionDeployment(DEV_DEPLOYMENT)).toBe(false);
    expect(deploymentHost(DEV_DEPLOYMENT)).toBe("valiant-ibis-521.convex.cloud");
    expect(() => deploymentHost("not-a-deployment")).toThrow("INVALID_DEPLOYMENT_ID");
  });
});

describe("legacy freeze production approval gate", () => {
  it("allows development deployments without extra approval", () => {
    expect(() => assertDeploymentAllowed(DEV_DEPLOYMENT, {}, { allowProduction: false })).not.toThrow();
    expect(() => assertDeploymentAllowed(DEV_DEPLOYMENT, {}, { allowProduction: true })).not.toThrow();
  });

  it("requires both the flag and the approval env for production", () => {
    expect(() => assertDeploymentAllowed(PROD_DEPLOYMENT, {}, { allowProduction: false })).toThrow("PRODUCTION_DEPLOYMENT_NOT_ALLOWED");
    expect(() => assertDeploymentAllowed(PROD_DEPLOYMENT, {}, { allowProduction: true })).toThrow("PRODUCTION_FREEZE_NOT_APPROVED");
    expect(() => assertDeploymentAllowed(PROD_DEPLOYMENT, { PRODUCTION_LEGACY_FREEZE_APPROVED: "false" }, { allowProduction: true })).toThrow("PRODUCTION_FREEZE_NOT_APPROVED");
    expect(() => assertDeploymentAllowed(PROD_DEPLOYMENT, { PRODUCTION_LEGACY_FREEZE_APPROVED: "true" }, { allowProduction: true })).not.toThrow();
  });

  it("refuses invalid ids and non-dev/non-prod scopes", () => {
    expect(() => assertDeploymentAllowed("not-a-deployment", {}, { allowProduction: true })).toThrow("INVALID_DEPLOYMENT_ID");
    expect(() => assertDeploymentAllowed("local:test-bed", { PRODUCTION_LEGACY_FREEZE_APPROVED: "true" }, { allowProduction: true })).toThrow("DEPLOYMENT_SCOPE_NOT_ALLOWED");
  });
});

describe("legacy freeze action and mode parsing", () => {
  it("defaults to the read-only status action", () => {
    expect(parseFreezeArgs([])).toEqual({ action: "status", execute: false, allowProduction: false });
    // pnpm forwards a standalone "--" separator; it must be ignored.
    expect(parseFreezeArgs(["--", "--action=status", "--deployment=dev:example"])).toMatchObject({ action: "status", deployment: "dev:example" });
  });

  it("parses positional and flag actions with execute and allowlist flags", () => {
    expect(parseFreezeArgs(["pause"])).toMatchObject({ action: "pause" });
    expect(parseFreezeArgs(["--action=rehearse", "--execute", "--allow-production"])).toEqual({
      action: "rehearse",
      execute: true,
      allowProduction: true,
    });
    expect(parseFreezeArgs(["verify", `--deployment=${DEV_DEPLOYMENT}`, "--evidence=/tmp/evidence.json"])).toEqual({
      action: "verify",
      execute: false,
      allowProduction: false,
      deployment: DEV_DEPLOYMENT,
      evidencePath: "/tmp/evidence.json",
    });
  });

  it("rejects unknown flags, invalid actions, and conflicting positionals", () => {
    expect(() => parseFreezeArgs(["--paused"])).toThrow("UNKNOWN_ARGUMENT");
    expect(() => parseFreezeArgs(["destroy"])).toThrow("INVALID_ACTION");
    expect(() => parseFreezeArgs(["--action=nope"])).toThrow("INVALID_ACTION");
    expect(() => parseFreezeArgs(["pause", "resume"])).toThrow("UNEXPECTED_ARGUMENT");
    expect(() => parseFreezeArgs(["--action=pause", "resume"])).toThrow("UNEXPECTED_ARGUMENT");
  });

  it("requires --execute for pause and resume but not for read-only actions", () => {
    expect(actionRequiresExecute("pause")).toBe(true);
    expect(actionRequiresExecute("resume")).toBe(true);
    expect(actionRequiresExecute("rehearse")).toBe(false);
    expect(actionRequiresExecute("verify")).toBe(false);
    expect(() => assertExecuteAllowed("pause", false)).toThrow("EXECUTE_REQUIRED");
    expect(() => assertExecuteAllowed("resume", false)).toThrow("EXECUTE_REQUIRED");
    expect(() => assertExecuteAllowed("pause", true)).not.toThrow();
    expect(() => assertExecuteAllowed("status", false)).not.toThrow();
    expect(() => assertExecuteAllowed("verify", false)).not.toThrow();
    expect(() => assertExecuteAllowed("rehearse", false)).not.toThrow();
  });

  it("guards action selection by string", () => {
    expect(isFreezeAction("rehearse")).toBe(true);
    expect(isFreezeAction("nope")).toBe(false);
    expect(isFreezeAction(1)).toBe(false);
  });
});

describe("legacy freeze redaction", () => {
  it("removes tokens, authorization values, keys, and URLs from text", () => {
    const redacted = redactText(
      `authorization: Convex ${TOKEN} access_token=${TOKEN} url=${URL} key=${KEY} jwt=${TOKEN}`,
    );
    expect(redacted).not.toContain(TOKEN);
    expect(redacted).not.toContain("convex.cloud");
    expect(redacted).not.toContain("0123456789abcdef");
    expect(redacted).toContain("[URL]");
    expect(redacted).toContain("[REDACTED]");
    expect(redacted).toContain("[KEY]");
  });

  it("redacts nested objects and arrays without mutating the source", () => {
    const source = { deployment: DEV_DEPLOYMENT, detail: `see ${URL}`, nested: [{ token: TOKEN }] };
    const redacted = redactUnknown(source) as Record<string, unknown>;
    expect(source.detail).toContain("convex.cloud");
    expect(String(redacted.detail)).not.toContain("convex.cloud");
    expect(JSON.stringify(redacted)).not.toContain(TOKEN);
  });
});

describe("legacy freeze pause signal and canary", () => {
  it("classifies pause signals from the control response body", () => {
    expect(classifyPauseSignal({ ok: true, status: 200, body: "deployment paused" })).toBe("paused");
    expect(classifyPauseSignal({ ok: true, status: 200, body: "deployment is unpaused" })).toBe("not-paused");
    expect(classifyPauseSignal({ ok: true, status: 200, body: "not paused" })).toBe("not-paused");
    expect(classifyPauseSignal({ ok: true, status: 200, body: "active" })).toBe("not-paused");
    expect(classifyPauseSignal({ ok: false, status: 404 })).toBe("unknown");
    expect(classifyPauseSignal({ ok: true, status: 200, body: "" })).toBe("unknown");
  });

  it("records a canary-write expectation that the tool does not perform", () => {
    const canary = buildCanaryExpectation();
    expect(canary.attempted).toBe(false);
    expect(canary.writeShouldBe).toBe("rejected");
    expect(canary.observed).toBe("not-attempted");
    expect(canary.note).toMatch(/does not perform/);
    expect(buildCanaryExpectation({ attempted: true, observed: "rejected" })).toMatchObject({
      attempted: true,
      observed: "rejected",
      writeShouldBe: "rejected",
    });
  });
});

describe("legacy freeze evidence shape", () => {
  const steps: FreezeStep[] = [
    { name: "pause_requested", at: "2026-09-13T00:00:00.000Z" },
    { name: "pause_response", at: "2026-09-13T00:00:01.000Z", detail: "status=200" },
  ];

  it("builds evidence with unassigned ownership and releaseCertified false", () => {
    const evidence = buildFreezeEvidence({
      deployment: DEV_DEPLOYMENT,
      action: "pause",
      startedAt: "2026-09-13T00:00:00.000Z",
      finishedAt: "2026-09-13T00:00:02.000Z",
      steps,
      paused: true,
      resumed: false,
      canary: buildCanaryExpectation(),
      signal: "unknown",
    });
    expect(evidence).toMatchObject({
      deployment: DEV_DEPLOYMENT,
      action: "pause",
      releaseCertified: false,
      startedAt: "2026-09-13T00:00:00.000Z",
      finishedAt: "2026-09-13T00:00:02.000Z",
      paused: true,
      resumed: false,
      signal: "unknown",
      owner: "UNASSIGNED",
      reviewer: "UNASSIGNED",
    });
    expect(evidence.steps).toEqual(steps);
    expect(evidence.canary).toMatchObject({ attempted: false, writeShouldBe: "rejected" });
    expect(evidence.limitations).toEqual([...FREEZE_LIMITATIONS]);
    expect(evidence.error).toBeUndefined();
  });

  it("defaults finishedAt to null, signal to unknown, and includes only a real error", () => {
    const evidence = buildFreezeEvidence({
      deployment: DEV_DEPLOYMENT,
      action: "verify",
      startedAt: "2026-09-13T00:00:00.000Z",
      steps: [],
      paused: false,
      resumed: false,
      canary: buildCanaryExpectation({ observed: "unknown" }),
      error: "PAUSE_NOT_CONFIRMED",
    });
    expect(evidence.finishedAt).toBeNull();
    expect(evidence.signal).toBe("unknown");
    expect(evidence.error).toBe("PAUSE_NOT_CONFIRMED");
    expect(evidence.limitations).toContain("Pause rejects new deployment calls; it does not prove in-flight work has drained.");
    const withoutError = buildFreezeEvidence({
      deployment: DEV_DEPLOYMENT,
      action: "verify",
      startedAt: "2026-09-13T00:00:00.000Z",
      steps: [],
      paused: false,
      resumed: false,
      canary: buildCanaryExpectation(),
    });
    expect("error" in withoutError).toBe(false);
  });
});
