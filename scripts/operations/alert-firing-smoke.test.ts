import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ALERT_CONDITION_IDS,
  HEARTBEAT_ABSENCE_CHECKS,
  alertSmokeGuardProblems,
  environmentHasProductionMarker,
  parseAlertSmokeArgs,
  renderAlertSmokePlan,
  runAlertFiringSmoke,
  writeAlertSmokeEvidence,
  type AlertSmokeEvidence,
} from "./alert-firing-smoke";

const FIXED_NOW = () => new Date("2026-09-13T00:00:00.000Z");

function evidenceFixture(): AlertSmokeEvidence {
  return runAlertFiringSmoke(
    { mode: "execute", environment: "isolated-1", confirmedFiring: [], confirmedRecovery: [] },
    { ALLOW_ALERT_SMOKE: "true" },
    FIXED_NOW,
  );
}

describe("alert-firing smoke guards", () => {
  it("defaults to dry-run and parses execute flags", () => {
    expect(parseAlertSmokeArgs([])).toEqual({ mode: "dry-run", confirmedFiring: [], confirmedRecovery: [] });
    expect(parseAlertSmokeArgs(["--execute", "--environment=isolated-1", "--evidence", "out.json"])).toEqual({
      mode: "execute",
      environment: "isolated-1",
      confirmedFiring: [],
      confirmedRecovery: [],
      evidencePath: "out.json",
    });
  });

  it("parses firing and recovery confirmations as repeats or comma-separated values", () => {
    expect(parseAlertSmokeArgs([
      "--execute",
      "--confirmed-firing=ReplacementOutboxDeadLettered,ReplacementWorkerJobFailures",
      "--confirmed-firing=ReplacementOutboxDispatcherUnavailable",
      "--confirmed-recovery=ReplacementOutboxDeadLettered",
    ]).confirmedFiring).toEqual([...ALERT_CONDITION_IDS]);
    expect(parseAlertSmokeArgs(["--confirmed-recovery", "ReplacementWorkerJobFailures"]).confirmedRecovery).toEqual(["ReplacementWorkerJobFailures"]);
  });

  it("refuses unknown conditions, unknown flags, and empty environments", () => {
    expect(() => parseAlertSmokeArgs(["--confirmed-firing=NotAnAlert"])).toThrow("unknown alert condition");
    expect(() => parseAlertSmokeArgs(["--bogus"])).toThrow("Unknown alert-firing-smoke option");
    expect(() => parseAlertSmokeArgs(["--environment="])).toThrow("--environment must name an isolated target.");
  });

  it("only guards execute mode and refuses production markers", () => {
    expect(alertSmokeGuardProblems({ mode: "dry-run", confirmedFiring: [], confirmedRecovery: [] }, {})).toEqual([]);
    expect(alertSmokeGuardProblems({ mode: "execute", confirmedFiring: [], confirmedRecovery: [] }, {})).toEqual([
      "ALLOW_ALERT_SMOKE (must be true to execute)",
      "--environment=<isolated target name> (required to execute)",
    ]);
    expect(alertSmokeGuardProblems({ mode: "execute", environment: "production-eu", confirmedFiring: [], confirmedRecovery: [] }, { ALLOW_ALERT_SMOKE: "true" })).toEqual([
      "--environment (must not reference production)",
    ]);
    expect(alertSmokeGuardProblems({ mode: "execute", environment: "isolated-1", confirmedFiring: [], confirmedRecovery: [] }, { ALLOW_ALERT_SMOKE: "true" })).toEqual([]);
  });

  it("detects production markers without matching product names", () => {
    expect(environmentHasProductionMarker("production")).toBe(true);
    expect(environmentHasProductionMarker("prod-eu")).toBe(true);
    expect(environmentHasProductionMarker("prd02")).toBe(true);
    expect(environmentHasProductionMarker("product-staging")).toBe(false);
    expect(environmentHasProductionMarker("isolated-1")).toBe(false);
  });
});

describe("alert-firing smoke evidence", () => {
  it("plans in dry-run and never claims certification", () => {
    const evidence = runAlertFiringSmoke({ mode: "dry-run", confirmedFiring: [], confirmedRecovery: [] }, {}, FIXED_NOW);
    expect(evidence).toMatchObject({ status: "planned", releaseCertified: false, owner: "UNASSIGNED", reviewer: "UNASSIGNED" });
    expect(evidence.conditions.every((condition) => condition.status === "planned" && !condition.confirmedFiring)).toBe(true);
  });

  it("stays incomplete when guards fail and passes once firing and recovery are confirmed", () => {
    const blocked = runAlertFiringSmoke({ mode: "execute", environment: "isolated-1", confirmedFiring: [...ALERT_CONDITION_IDS], confirmedRecovery: [...ALERT_CONDITION_IDS] }, {}, FIXED_NOW);
    expect(blocked.status).toBe("incomplete");
    expect(blocked.conditions.every((condition) => condition.status === "planned")).toBe(true);

    const passed = runAlertFiringSmoke(
      { mode: "execute", environment: "isolated-1", confirmedFiring: [...ALERT_CONDITION_IDS], confirmedRecovery: [...ALERT_CONDITION_IDS] },
      { ALLOW_ALERT_SMOKE: "true" },
      FIXED_NOW,
    );
    expect(passed.status).toBe("passed");
    expect(passed.conditions.every((condition) => condition.status === "confirmed")).toBe(true);
    expect(passed.generatedAt).toBe("2026-09-13T00:00:00.000Z");

    const partial = runAlertFiringSmoke(
      { mode: "execute", environment: "isolated-1", confirmedFiring: ["ReplacementOutboxDeadLettered"], confirmedRecovery: [] },
      { ALLOW_ALERT_SMOKE: "true" },
      FIXED_NOW,
    );
    expect(partial.conditions.find((condition) => condition.id === "ReplacementOutboxDeadLettered")).toMatchObject({ status: "firing" });
    expect(partial.status).toBe("incomplete");
  });

  it("renders operator commands and heartbeat absence guidance", () => {
    const plan = renderAlertSmokePlan();
    for (const id of ALERT_CONDITION_IDS) expect(plan).toContain(id);
    for (const check of HEARTBEAT_ABSENCE_CHECKS) expect(plan).toContain(check.signal);
    expect(plan).not.toContain("PERFORMANCE_SESSION_COOKIE");
  });

  it("writes owner-only, non-overwritable evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "alert-firing-smoke-test-"));
    const file = join(directory, "evidence.json");
    try {
      await writeAlertSmokeEvidence(file, evidenceFixture());
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      await expect(writeAlertSmokeEvidence(file, evidenceFixture())).rejects.toMatchObject({ code: "EEXIST" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
