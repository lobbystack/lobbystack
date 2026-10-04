import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { writePrivateJson } from "../lib/private-artifact";
import { hasProductionMarker } from "../performance/soak-certification";

export const ALERT_CONDITION_IDS = [
  "ReplacementOutboxDeadLettered",
  "ReplacementWorkerJobFailures",
  "ReplacementOutboxDispatcherUnavailable",
] as const;

export type AlertConditionId = (typeof ALERT_CONDITION_IDS)[number];

export type AlertCondition = {
  id: AlertConditionId;
  title: string;
  trigger: string;
  operatorCommand: string;
  recoveryCommand: string;
  safeguards: string[];
};

// The operator commands are the procedures in docs/operations/alerts.md. This
// tool never runs them itself: it emits them for a human and records outcomes.
export const ALERT_CONDITIONS: AlertCondition[] = [
  {
    id: "ReplacementOutboxDeadLettered",
    title: "An outbox message exhausted ten delivery attempts",
    trigger: "A deliberately unsupported outbox topic reaches the terminal retry threshold (ten delivery attempts).",
    operatorCommand: [
      "1. In the isolated target only, submit a deliberately unsupported outbox topic with a unique idempotency key.",
      "2. Advance it to the terminal retry threshold (ten delivery attempts) so dead_lettered_at is set.",
      "3. Verify firing without exposing payload:",
      "   SELECT id, topic, dead_lettered_at FROM operations.outbox_messages WHERE dead_lettered_at IS NOT NULL;",
    ].join("\n"),
    recoveryCommand: [
      "1. Identify the topic and redacted error category from the row; do not copy payload into incident systems.",
      "2. Fix the provider or handler.",
      "3. Create a new idempotent outbox message. Do not clear the original row.",
    ].join("\n"),
    safeguards: ["Never clear or delete the original outbox row.", "Do not copy payloads into the evidence file."],
  },
  {
    id: "ReplacementWorkerJobFailures",
    title: "At least three BullMQ jobs failed within ten minutes",
    trigger: "Three or more BullMQ jobs fail inside a ten-minute window.",
    operatorCommand: [
      "1. In a disposable isolated environment, interrupt the dependencies that make jobs fail.",
      "   Example (disposable Compose target only): docker compose stop redis postgres",
      "2. Submit at least three jobs so each fails and the worker alert activates.",
      "3. Confirm Redis and PostgreSQL health in worker logs and BullMQ state by queue and job type.",
    ].join("\n"),
    recoveryCommand: [
      "1. Restore each dependency. Example: docker compose start postgres redis",
      "2. Confirm the alert resolves and durable processing resumes.",
      "Do not copy job payloads (they can contain customer data) into incident systems.",
    ].join("\n"),
    safeguards: ["Never run `docker compose down -v` or delete volumes/queues.", "Keep payloads out of evidence."],
  },
  {
    id: "ReplacementOutboxDispatcherUnavailable",
    title: "At least three PostgreSQL polling attempts failed within five minutes",
    trigger: "Three or more dispatcher PostgreSQL poll attempts fail inside a five-minute window.",
    operatorCommand: [
      "1. In a disposable isolated environment, interrupt PostgreSQL or block the dispatcher database.",
      "   Example (disposable Compose target only): docker compose stop postgres",
      "2. Confirm at least three poll failures within five minutes in dispatcher logs.",
    ].join("\n"),
    recoveryCommand: [
      "1. Restore PostgreSQL and confirm the alert resolves and durable processing resumes.",
      "2. Check REPLACEMENT_DISPATCHER_DATABASE_URL, the lobbystack_dispatcher role, PostgreSQL readiness, connection limits, and network.",
      "Pending durable work remains in PostgreSQL and resumes automatically after recovery.",
    ].join("\n"),
    safeguards: ["Do not delete or drain the outbox.", "Never point at production."],
  },
];

export type AbsenceCheck = { id: string; signal: string; guidance: string };

// Error Tracking cannot notify on an event that never arrived; these belong in
// Product Analytics absence alerts per docs/telemetry/provider-failure-error-tracking.md.
export const HEARTBEAT_ABSENCE_CHECKS: AbsenceCheck[] = [
  {
    id: "service-health",
    signal: "ops.service.health_check",
    guidance: "Alert on absent ops.service.health_check or sustained ops.service.health_check_failed for each runtime.",
  },
];

export type AlertSmokeMode = "dry-run" | "execute";

export type AlertSmokeCliOptions = {
  mode: AlertSmokeMode;
  environment?: string;
  confirmedFiring: AlertConditionId[];
  confirmedRecovery: AlertConditionId[];
  evidencePath?: string;
};

export type AlertSmokeConditionResult = {
  id: AlertConditionId;
  status: "planned" | "confirmed" | "firing" | "recovery-only" | "pending";
  confirmedFiring: boolean;
  confirmedRecovery: boolean;
  trigger: string;
  operatorCommand: string;
  recoveryCommand: string;
  safeguards: string[];
};

export type AlertSmokeEvidence = {
  schemaVersion: 1;
  kind: "alert-firing-smoke";
  runId: string;
  generatedAt: string;
  mode: AlertSmokeMode;
  environment: string | null;
  releaseCertified: false;
  owner: "UNASSIGNED";
  reviewer: "UNASSIGNED";
  status: "planned" | "passed" | "incomplete";
  allowAlertSmoke: boolean;
  conditions: AlertSmokeConditionResult[];
  absenceChecks: AbsenceCheck[];
  notes: string[];
};

function isConditionId(value: string): value is AlertConditionId {
  return (ALERT_CONDITION_IDS as readonly string[]).includes(value);
}

function parseConditionIds(flag: string, value: string): AlertConditionId[] {
  const ids: AlertConditionId[] = [];
  for (const raw of value.split(",")) {
    const id = raw.trim();
    if (!id) continue;
    if (!isConditionId(id)) throw new Error(`${flag} received an unknown alert condition: ${id}.`);
    ids.push(id);
  }
  return ids;
}

export function parseAlertSmokeArgs(args: string[]): AlertSmokeCliOptions {
  const { values } = parseArgs({
    args,
    strict: true,
    options: {
      "dry-run": { type: "boolean" },
      execute: { type: "boolean" },
      environment: { type: "string" },
      evidence: { type: "string" },
      "confirmed-firing": { type: "string", multiple: true },
      "confirmed-recovery": { type: "string", multiple: true },
    },
  });
  const { environment, evidence: evidencePath } = values;
  if (environment !== undefined && !environment.trim()) throw new Error("--environment must name an isolated target.");
  const confirmedFiring = (values["confirmed-firing"] ?? []).flatMap((value) => parseConditionIds("--confirmed-firing", value));
  const confirmedRecovery = (values["confirmed-recovery"] ?? []).flatMap((value) => parseConditionIds("--confirmed-recovery", value));
  return {
    // --dry-run wins when both modes are passed.
    mode: values.execute && !values["dry-run"] ? "execute" : "dry-run",
    ...(environment ? { environment } : {}),
    confirmedFiring: [...new Set(confirmedFiring)],
    confirmedRecovery: [...new Set(confirmedRecovery)],
    ...(evidencePath ? { evidencePath } : {}),
  };
}

export function alertSmokeGuardProblems(options: AlertSmokeCliOptions, environment: NodeJS.ProcessEnv): string[] {
  if (options.mode !== "execute") return [];
  const problems: string[] = [];
  if (environment.ALLOW_ALERT_SMOKE !== "true") problems.push("ALLOW_ALERT_SMOKE (must be true to execute)");
  if (!options.environment?.trim()) problems.push("--environment=<isolated target name> (required to execute)");
  else if (hasProductionMarker(options.environment)) problems.push("--environment (must not reference production)");
  return problems;
}

export function runAlertFiringSmoke(
  options: AlertSmokeCliOptions,
  environment: NodeJS.ProcessEnv,
  now: () => Date = () => new Date(),
): AlertSmokeEvidence {
  const guardProblems = alertSmokeGuardProblems(options, environment);
  const firing = new Set(options.confirmedFiring);
  const recovery = new Set(options.confirmedRecovery);

  const conditions: AlertSmokeConditionResult[] = ALERT_CONDITIONS.map((condition) => {
    const confirmedFiring = options.mode === "execute" && guardProblems.length === 0 && firing.has(condition.id);
    const confirmedRecovery = options.mode === "execute" && guardProblems.length === 0 && recovery.has(condition.id);
    const status: AlertSmokeConditionResult["status"] =
      options.mode === "dry-run" || guardProblems.length > 0
        ? "planned"
        : confirmedFiring && confirmedRecovery
          ? "confirmed"
          : confirmedFiring
            ? "firing"
            : confirmedRecovery
              ? "recovery-only"
              : "pending";
    return {
      id: condition.id,
      status,
      confirmedFiring,
      confirmedRecovery,
      trigger: condition.trigger,
      operatorCommand: condition.operatorCommand,
      recoveryCommand: condition.recoveryCommand,
      safeguards: condition.safeguards,
    };
  });

  const notes: string[] = [];
  if (options.mode === "dry-run") notes.push("Dry-run only: no writes, no provider calls, no data deletion.");
  if (guardProblems.length) notes.push(`Guards failed: ${guardProblems.join("; ")}`);
  if (options.mode === "execute" && guardProblems.length === 0) {
    notes.push("This tool emits operator commands only; it never interrupts services, calls providers, or deletes data.");
    notes.push("ALLOW_ALERT_SMOKE=true was set for this isolated target.");
  }

  const expected = ALERT_CONDITIONS.length;
  const confirmed = conditions.filter((condition) => condition.status === "confirmed").length;
  const status: AlertSmokeEvidence["status"] =
    options.mode === "dry-run" ? "planned" : guardProblems.length ? "incomplete" : confirmed === expected ? "passed" : "incomplete";

  return {
    schemaVersion: 1,
    kind: "alert-firing-smoke",
    runId: environment.ALERT_SMOKE_RUN_ID?.trim() || randomUUID(),
    generatedAt: now().toISOString(),
    mode: options.mode,
    environment: options.environment ?? null,
    releaseCertified: false,
    owner: "UNASSIGNED",
    reviewer: "UNASSIGNED",
    status,
    allowAlertSmoke: environment.ALLOW_ALERT_SMOKE === "true",
    conditions,
    absenceChecks: HEARTBEAT_ABSENCE_CHECKS.map((check) => ({ ...check })),
    notes,
  };
}

export function renderAlertSmokePlan(): string {
  const lines: string[] = [
    "Alert-firing smoke (dry-run). No writes, no provider calls, no data deletion.",
    "",
    "Required external configuration:",
    "- OTLP/monitoring alert rules for the three conditions in docs/operations/alerts.md.",
    "- A disposable isolated target with non-production provider credentials.",
    "- ALLOW_ALERT_SMOKE=true and an explicit --environment only when executing.",
    "",
  ];
  for (const condition of ALERT_CONDITIONS) {
    lines.push(
      `## ${condition.id} — ${condition.title}`,
      `Trigger: ${condition.trigger}`,
      "Operator command:",
      condition.operatorCommand,
      "Recovery:",
      condition.recoveryCommand,
      `Safeguards: ${condition.safeguards.join(" ")}`,
      "",
    );
  }
  lines.push("Absence checks (configure in Product Analytics, not Error Tracking):");
  for (const check of HEARTBEAT_ABSENCE_CHECKS) lines.push(`- ${check.id} (${check.signal}): ${check.guidance}`);
  lines.push("", "Confirm outcomes with --confirmed-firing=<condition> and --confirmed-recovery=<condition>.");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const options = parseAlertSmokeArgs(process.argv.slice(2));
  console.log(renderAlertSmokePlan());
  if (options.mode === "dry-run") return;
  const evidence = runAlertFiringSmoke(options, process.env);
  if (options.evidencePath) await writePrivateJson(options.evidencePath, evidence);
  console.log(JSON.stringify(evidence));
  if (evidence.status !== "passed") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
