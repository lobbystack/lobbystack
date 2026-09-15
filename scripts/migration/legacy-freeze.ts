import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// Pure helpers
//
// Everything in this section is deterministic and side-effect free so it can be
// unit-tested without a network, filesystem, clock, or environment. The CLI
// section below is the only place that performs I/O.
//
// Pause is a native Convex deployment control that rejects new calls. It is a
// write-freeze candidate only: it does not quiesce in-flight work and it does
// not buffer inbound provider events. This tool never claims otherwise.
// ---------------------------------------------------------------------------

export const FREEZE_ACTIONS = ["status", "pause", "verify", "resume", "rehearse"] as const;
export type FreezeAction = (typeof FREEZE_ACTIONS)[number];

export const DEPLOYMENT_PATTERN = /^[a-z][a-z0-9-]{0,40}:[a-z0-9][a-z0-9-]{0,62}$/;

export const FREEZE_LIMITATIONS: readonly string[] = [
  "Pause rejects new deployment calls; it does not prove in-flight work has drained.",
  "Pause does not buffer or replay inbound provider webhooks; provider retry behavior must be approved and reconciled separately.",
  "This evidence never certifies a release; releaseCertified is always false.",
];

export interface ParsedFreezeArgs {
  action: FreezeAction;
  execute: boolean;
  allowProduction: boolean;
  deployment?: string;
  evidencePath?: string;
}

export interface FreezeStep {
  name: string;
  at: string;
  detail?: string;
}

export interface CanaryExpectation {
  attempted: boolean;
  writeShouldBe: "rejected";
  observed: "not-attempted" | "rejected" | "accepted" | "unknown";
  note: string;
}

export type PauseSignal = "paused" | "not-paused" | "unknown";

export interface FreezeEvidenceInput {
  deployment: string;
  action: FreezeAction;
  startedAt: string;
  finishedAt?: string;
  steps: FreezeStep[];
  paused: boolean;
  resumed: boolean;
  canary: CanaryExpectation;
  signal?: PauseSignal;
  error?: string;
}

export function isFreezeAction(value: unknown): value is FreezeAction {
  return typeof value === "string" && (FREEZE_ACTIONS as readonly string[]).includes(value);
}

export function parseDeploymentId(value: string): { scope: string; name: string } | undefined {
  if (!DEPLOYMENT_PATTERN.test(value)) return undefined;
  const at = value.indexOf(":");
  return { scope: value.slice(0, at), name: value.slice(at + 1) };
}

export function isValidDeploymentId(value: unknown): value is string {
  return typeof value === "string" && DEPLOYMENT_PATTERN.test(value);
}

export function deploymentScope(value: string): string | undefined {
  return parseDeploymentId(value)?.scope;
}

export function isProductionDeployment(value: string): boolean {
  return deploymentScope(value) === "prod";
}

export function deploymentHost(deployment: string): string {
  const parsed = parseDeploymentId(deployment);
  if (!parsed) throw new Error("INVALID_DEPLOYMENT_ID");
  return `${parsed.name}.convex.cloud`;
}

export function parseFreezeArgs(argv: string[]): ParsedFreezeArgs {
  const parsed: ParsedFreezeArgs = { action: "status", execute: false, allowProduction: false };
  let actionSet = false;
  for (const argument of argv) {
    if (argument === "--") continue;
    if (argument === "--execute") {
      parsed.execute = true;
      continue;
    }
    if (argument === "--allow-production") {
      parsed.allowProduction = true;
      continue;
    }
    if (argument.startsWith("--deployment=")) {
      parsed.deployment = argument.slice("--deployment=".length);
      continue;
    }
    if (argument.startsWith("--evidence=")) {
      parsed.evidencePath = argument.slice("--evidence=".length);
      continue;
    }
    if (argument.startsWith("--action=")) {
      const value = argument.slice("--action=".length);
      if (!isFreezeAction(value)) throw new Error("INVALID_ACTION");
      if (actionSet) throw new Error("UNEXPECTED_ARGUMENT");
      parsed.action = value;
      actionSet = true;
      continue;
    }
    if (argument.startsWith("--")) throw new Error("UNKNOWN_ARGUMENT");
    if (actionSet) throw new Error("UNEXPECTED_ARGUMENT");
    if (!isFreezeAction(argument)) throw new Error("INVALID_ACTION");
    parsed.action = argument;
    actionSet = true;
  }
  return parsed;
}

export function actionRequiresExecute(action: FreezeAction): boolean {
  return action === "pause" || action === "resume";
}

export function assertExecuteAllowed(action: FreezeAction, execute: boolean): void {
  if (actionRequiresExecute(action) && !execute) throw new Error("EXECUTE_REQUIRED");
}

export function assertDeploymentAllowed(
  deployment: string,
  env: Record<string, string | undefined>,
  options: { allowProduction: boolean },
): void {
  if (!isValidDeploymentId(deployment)) throw new Error("INVALID_DEPLOYMENT_ID");
  const scope = deploymentScope(deployment);
  if (scope === "dev") return;
  if (scope === "prod") {
    if (!options.allowProduction) throw new Error("PRODUCTION_DEPLOYMENT_NOT_ALLOWED");
    if (env.PRODUCTION_LEGACY_FREEZE_APPROVED !== "true") throw new Error("PRODUCTION_FREEZE_NOT_APPROVED");
    return;
  }
  throw new Error("DEPLOYMENT_SCOPE_NOT_ALLOWED");
}

export function buildCanaryExpectation(overrides: Partial<CanaryExpectation> = {}): CanaryExpectation {
  return {
    attempted: false,
    writeShouldBe: "rejected",
    observed: "not-attempted",
    note: "While paused, a legacy write is expected to be rejected. This tool does not perform the write; the reviewer must run and record a separate approved canary write.",
    ...overrides,
  };
}

export function classifyPauseSignal(input: { ok: boolean; status: number; body?: string }): PauseSignal {
  const body = input.body ?? "";
  if (/unpaus|not[\s_-]*paus|running|active/i.test(body)) return "not-paused";
  if (/paus/i.test(body)) return "paused";
  return "unknown";
}

export function redactText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"'`<>]+/gi, "[URL]")
    .replace(/\b(?:dev|prod|local|staging):[a-z0-9-]+\|[^\s"'`]+/gi, "[KEY]")
    .replace(/\bConvex\s+\S+/gi, "Convex [REDACTED]")
    .replace(/((?:authorization|access[_-]?token|api[_-]?key|secret|token)\s*[:=]\s*)\S+/gi, "$1[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[TOKEN]");
}

export function redactUnknown(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map((item) => redactUnknown(item));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, redactUnknown(item)]),
    );
  }
  return value;
}

export function buildFreezeEvidence(input: FreezeEvidenceInput): Record<string, unknown> {
  return {
    deployment: input.deployment,
    action: input.action,
    releaseCertified: false,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt ?? null,
    steps: input.steps,
    paused: input.paused,
    resumed: input.resumed,
    canary: input.canary,
    signal: input.signal ?? "unknown",
    owner: "UNASSIGNED",
    reviewer: "UNASSIGNED",
    limitations: [...FREEZE_LIMITATIONS],
    ...(input.error ? { error: input.error } : {}),
  };
}

// ---------------------------------------------------------------------------
// CLI / network I/O
// ---------------------------------------------------------------------------

const CONTROL_TIMEOUT_MS = 20_000;
const PROBE_TIMEOUT_MS = 10_000;

function errorCode(error: unknown): string {
  return error instanceof Error && /^[A-Z_]+(?::[A-Za-z0-9_,.-]+)*$/.test(error.message)
    ? error.message
    : "LEGACY_FREEZE_FAILED_REDACTED";
}

function controlPath(action: "pause" | "resume"): string {
  return action === "pause" ? "pause_deployment" : "unpause_deployment";
}

async function sendControl(deployment: string, action: "pause" | "resume", token: string): Promise<number> {
  const response = await fetch(`https://${deploymentHost(deployment)}/api/v1/${controlPath(action)}`, {
    method: "POST",
    headers: { authorization: `Convex ${token}` },
    signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
  });
  try {
    await response.arrayBuffer();
  } catch {
    // Response body is discarded and never logged.
  }
  return response.status;
}

async function probePauseSignal(deployment: string, token: string): Promise<PauseSignal> {
  try {
    const response = await fetch(`https://${deploymentHost(deployment)}/api/v1/status`, {
      method: "GET",
      headers: { authorization: `Convex ${token}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!response.ok) return "unknown";
    const body = await response.text().catch(() => "");
    return classifyPauseSignal({ ok: response.ok, status: response.status, body });
  } catch {
    return "unknown";
  }
}

async function writeEvidence(path: string, evidence: Record<string, unknown>): Promise<void> {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(redactUnknown(evidence), null, 2)}\n`, "utf8");
  } finally {
    await handle.close();
  }
}

async function main(): Promise<void> {
  const args = parseFreezeArgs(process.argv.slice(2));
  const env = process.env;
  const startedAt = new Date().toISOString();
  const deployment = args.deployment;
  const steps: FreezeStep[] = [];
  const canary = buildCanaryExpectation();
  let paused = false;
  let resumed = false;
  let signal: PauseSignal = "unknown";
  let error: string | undefined;

  const step = (name: string, detail?: string): void => {
    if (detail === undefined) steps.push({ name, at: new Date().toISOString() });
    else steps.push({ name, at: new Date().toISOString(), detail: redactText(detail) });
  };

  try {
    assertExecuteAllowed(args.action, args.execute);
    if (args.action !== "status") {
      if (!deployment) throw new Error("DEPLOYMENT_REQUIRED");
      assertDeploymentAllowed(deployment, env, { allowProduction: args.allowProduction });
    } else if (deployment && !isValidDeploymentId(deployment)) {
      throw new Error("INVALID_DEPLOYMENT_ID");
    }

    const executesWrite = args.action === "pause" || args.action === "resume" || (args.action === "rehearse" && args.execute);
    if (args.action !== "status" && (executesWrite || args.action === "verify") && !args.evidencePath) {
      throw new Error("EVIDENCE_PATH_REQUIRED");
    }

    if (args.action === "status") {
      step("status_read_only");
    } else {
      const token = env.CONVEX_ACCESS_TOKEN;
      if (args.action === "verify") {
        if (!token) throw new Error("CONVEX_ACCESS_TOKEN_REQUIRED");
        step("read_only_signal_check");
        signal = await probePauseSignal(deployment!, token);
        step("signal_classified", signal);
        step("canary_expectation_recorded");
      } else if (args.action === "pause") {
        if (!token) throw new Error("CONVEX_ACCESS_TOKEN_REQUIRED");
        step("pause_requested");
        paused = (await sendControl(deployment!, "pause", token)) === 200;
        step("pause_response", `status=${paused ? 200 : "non-200"}`);
        if (!paused) throw new Error("PAUSE_NOT_CONFIRMED");
      } else if (args.action === "resume") {
        if (!token) throw new Error("CONVEX_ACCESS_TOKEN_REQUIRED");
        step("resume_requested");
        resumed = (await sendControl(deployment!, "resume", token)) === 200;
        step("resume_response", `status=${resumed ? 200 : "non-200"}`);
        if (!resumed) throw new Error("RESUME_NOT_CONFIRMED");
        paused = false;
      } else if (args.action === "rehearse" && args.execute) {
        if (!token) throw new Error("CONVEX_ACCESS_TOKEN_REQUIRED");
        try {
          step("pause_requested");
          paused = (await sendControl(deployment!, "pause", token)) === 200;
          step("pause_response", `status=${paused ? 200 : "non-200"}`);
          if (!paused) throw new Error("PAUSE_NOT_CONFIRMED");
          step("read_only_signal_check");
          signal = await probePauseSignal(deployment!, token);
          step("signal_classified", signal);
          step("canary_expectation_recorded");
        } finally {
          try {
            step("resume_requested");
            resumed = (await sendControl(deployment!, "resume", token)) === 200;
            step("resume_response", `status=${resumed ? 200 : "non-200"}`);
            if (!resumed) error = "RESUME_NOT_CONFIRMED";
            else paused = false;
          } catch {
            error = "RESUME_REQUEST_FAILED";
          }
        }
      } else {
        step("dry_run");
        step("planned_pause");
        step("planned_verify");
        step("planned_resume");
        step("canary_expectation_recorded");
      }
    }
  } catch (caught) {
    error = errorCode(caught);
    process.exitCode = 1;
  } finally {
    const evidence = buildFreezeEvidence({
      deployment: deployment ?? "UNSPECIFIED",
      action: args.action,
      startedAt,
      finishedAt: new Date().toISOString(),
      steps,
      paused,
      resumed,
      canary,
      signal,
      ...(error ? { error } : {}),
    });
    if (args.evidencePath) {
      try {
        await writeEvidence(args.evidencePath, evidence);
      } catch (writeError) {
        if (!error) {
          error = errorCode(writeError);
          process.exitCode = 1;
        }
      }
    }
    console.log(
      JSON.stringify(
        redactUnknown({
          action: args.action,
          deployment: deployment ?? null,
          paused,
          resumed,
          signal,
          canary: canary.observed,
          releaseCertified: false,
          error: error ?? null,
        }),
      ),
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main();
}
