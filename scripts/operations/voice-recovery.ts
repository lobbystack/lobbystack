import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { createDatabaseClient, type Database } from "@lobbystack/db";
import { z } from "zod";

import {
  completeReconciledWebVoiceCall,
  listStalledWebVoiceCalls,
  summarizeReconciliation,
  type WebVoiceReconcileEvidence,
} from "../../packages/domain/src/server/voiceRecovery";

/**
 * Bounded web-voice reconciliation for calls the gateway left open.
 *
 * Dry-run is the default and the only mode that lists candidates. Applying a
 * resolution requires an explicit call ID plus proof: either the provider is
 * confirmed terminal with reported seconds, or an operator attests that the
 * provider consumed nothing. The tool never releases allowance from elapsed
 * time, and it prints no customer PII: only call IDs, provider kind, status,
 * and timing.
 */

const optionsSchema = z.object({
  businessId: z.string().uuid(),
  olderThanMinutes: z.coerce.number().int().min(1).max(1_440).default(15),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  apply: z.boolean().default(false),
  callId: z.string().uuid().optional(),
  evidence: z.enum(["provider-terminal", "operator-attestation"]).optional(),
  providerCallId: z.string().trim().min(1).max(255).optional(),
  providerDurationSeconds: z.coerce.number().int().min(0).max(86_400).optional(),
  mediaDurationSeconds: z.coerce.number().int().min(0).max(86_400).optional(),
  reference: z.string().trim().min(1).max(200).optional(),
}).superRefine((value, ctx) => {
  const applyFlag = value.callId !== undefined || value.evidence !== undefined || value.reference !== undefined
    || value.providerCallId !== undefined || value.providerDurationSeconds !== undefined || value.mediaDurationSeconds !== undefined;
  if (!value.apply) {
    if (applyFlag) ctx.addIssue({ code: "custom", message: "Resolution flags require --apply; the default mode only lists candidates." });
    return;
  }
  if (!value.callId) ctx.addIssue({ code: "custom", message: "--apply requires --call-id." });
  if (!value.reference) ctx.addIssue({ code: "custom", message: "--apply requires --reference identifying the verification or approval." });
  if (!value.evidence) {
    ctx.addIssue({ code: "custom", message: "--apply requires --evidence provider-terminal or operator-attestation." });
    return;
  }
  if (value.evidence === "provider-terminal") {
    if (!value.providerCallId || value.providerCallId.startsWith("webcall_")) {
      ctx.addIssue({ code: "custom", message: "Provider-terminal verification requires the real --provider-call-id from the durable row." });
    }
    if (value.providerDurationSeconds === undefined && value.mediaDurationSeconds === undefined) {
      ctx.addIssue({ code: "custom", message: "Provider-terminal verification requires reported --provider-duration-seconds or --media-duration-seconds." });
    }
  } else if (value.providerDurationSeconds !== undefined || value.mediaDurationSeconds !== undefined) {
    ctx.addIssue({ code: "custom", message: "Operator attestation must not claim provider seconds; it attests unconsumed usage only." });
  }
});

export type VoiceRecoveryOptions = z.infer<typeof optionsSchema>;

export function parseVoiceRecoveryArgs(args: string[]): VoiceRecoveryOptions {
  const { values } = parseArgs({ args, options: {
    "business-id": { type: "string" },
    "older-than-minutes": { type: "string" },
    limit: { type: "string" },
    apply: { type: "boolean", default: false },
    "call-id": { type: "string" },
    evidence: { type: "string" },
    "provider-call-id": { type: "string" },
    "provider-duration-seconds": { type: "string" },
    "media-duration-seconds": { type: "string" },
    reference: { type: "string" },
  } });
  return optionsSchema.parse({
    businessId: values["business-id"],
    olderThanMinutes: values["older-than-minutes"],
    limit: values.limit,
    apply: values.apply,
    callId: values["call-id"],
    evidence: values.evidence,
    providerCallId: values["provider-call-id"],
    providerDurationSeconds: values["provider-duration-seconds"],
    mediaDurationSeconds: values["media-duration-seconds"],
    reference: values.reference,
  });
}

export type VoiceRecoveryReport =
  | {
      mode: "dry-run";
      businessId: string;
      olderThanMinutes: number;
      examined: number;
      summary: { total: number; unallocatedUnknown: number; allocated: number };
      candidates: Array<{
        callId: string;
        providerKind: "unallocated_unknown" | "allocated";
        status: string;
        startedAt: string;
        ageMs: number;
        reservedSeconds: number;
        requiredOperatorAction: string;
      }>;
      pageFull: boolean;
    }
  | { mode: "apply"; callId: string; outcome: string; disposition?: string; boundedSeconds?: number };

export async function runVoiceRecovery(db: Database, raw: z.input<typeof optionsSchema>, nowMs = Date.now()): Promise<VoiceRecoveryReport> {
  const options = optionsSchema.parse(raw);
  if (!options.apply) {
    const candidates = await listStalledWebVoiceCalls(db, {
      businessId: options.businessId,
      olderThanMs: options.olderThanMinutes * 60_000,
      limit: options.limit,
      nowMs,
    });
    return {
      mode: "dry-run",
      businessId: options.businessId,
      olderThanMinutes: options.olderThanMinutes,
      examined: candidates.length,
      summary: summarizeReconciliation(candidates),
      candidates: candidates.map((candidate) => ({
        callId: candidate.callId,
        providerKind: candidate.providerKind,
        status: candidate.status,
        startedAt: candidate.startedAt,
        ageMs: candidate.ageMs,
        reservedSeconds: candidate.reservedSeconds,
        requiredOperatorAction: candidate.requiredOperatorAction,
      })),
      pageFull: candidates.length === options.limit,
    };
  }

  const evidence: WebVoiceReconcileEvidence = options.evidence === "provider-terminal"
    ? {
        kind: "provider_terminal",
        reference: options.reference!,
        providerCallId: options.providerCallId!,
        ...(options.providerDurationSeconds !== undefined ? { providerDurationSeconds: options.providerDurationSeconds } : {}),
        ...(options.mediaDurationSeconds !== undefined ? { mediaDurationSeconds: options.mediaDurationSeconds } : {}),
      }
    : { kind: "operator_attestation", reference: options.reference! };

  const result = await completeReconciledWebVoiceCall(db, { businessId: options.businessId, callId: options.callId!, evidence, nowMs });
  if (result.outcome === "completed") {
    return { mode: "apply", callId: result.callId, outcome: result.outcome, disposition: result.disposition, boundedSeconds: result.boundedSeconds };
  }
  if (result.outcome === "rejected") {
    return { mode: "apply", callId: result.callId, outcome: `${result.outcome}:${result.code}` };
  }
  return { mode: "apply", callId: result.callId, outcome: result.outcome };
}

async function main(): Promise<void> {
  // Surface arg problems before touching the database so a mistyped command never runs against it.
  const options = parseVoiceRecoveryArgs(process.argv.slice(2));
  if (!process.env.VOICE_RECOVERY_DATABASE_URL) throw new Error("VOICE_RECOVERY_DATABASE_URL is required.");
  const client = createDatabaseClient("lobbystack_worker", { DATABASE_URL: process.env.VOICE_RECOVERY_DATABASE_URL });
  try {
    const role = await client.pool.query<{ current_user: string }>("select current_user");
    if (role.rows[0]?.current_user !== "lobbystack_worker") throw new Error("Voice recovery requires the worker database role.");
    const report = await runVoiceRecovery(client.db, options);
    console.log(JSON.stringify(report));
  } finally {
    await client.pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // Database and validation errors can echo credentials or supplied values.
    console.error("Voice recovery failed; check arguments, evidence flags, and database access.");
    process.exitCode = 1;
  });
}
