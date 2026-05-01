import type { BusinessContextSnapshot } from "@lobbystack/shared";
import { z } from "zod";

import {
  recordToolExecutionFailure,
  recordToolExecutionLatency,
} from "../observability/posthog";
import {
  bookVoiceAppointment,
  cancelVoiceAppointment,
  checkVoiceAvailability,
  findVoiceAvailability,
  lookupVoiceAppointmentForChange,
  rescheduleVoiceAppointment,
  searchVoiceKnowledge,
  sendVoiceAppointmentChangeOtp,
  takeVoiceMessage,
  updateVoiceTransferState,
  verifyVoiceAppointmentChangeOtp,
  verifyVoiceAppointmentForChange,
} from "../convex/runtimeClient";
import {
  MAX_CUMULATIVE_HOLD_SECONDS,
  MAX_SINGLE_HOLD_SECONDS,
  type EndCallRequest,
  type HoldGrantResult,
} from "./callControl";

function normalizeComparable(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const normalizedHours = ((hours + 11) % 12) + 1;
  return `${normalizedHours}:${minutes.toString().padStart(2, "0")} ${suffix}`;
}

function buildHoursSummary(snapshot: BusinessContextSnapshot): string {
  if (snapshot.hours.length === 0) {
    return `No structured business hours are configured for ${snapshot.displayName}.`;
  }

  const ordered = snapshot.hours.slice().sort((left, right) => left.dayOfWeek - right.dayOfWeek);
  return ordered
    .map(
      (row) =>
        `${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][row.dayOfWeek]}: ${formatMinutes(row.openMinutes)} to ${formatMinutes(row.closeMinutes)}`,
    )
    .join("\n");
}

function buildServicesSummary(snapshot: BusinessContextSnapshot): string {
  if (snapshot.services.length === 0) {
    return `No structured services are configured for ${snapshot.displayName}.`;
  }

  return snapshot.services
    .map((service) => {
      const description = service.description?.trim();
      return description
        ? `${service.name} (${service.durationMinutes} min): ${description}`
        : `${service.name} (${service.durationMinutes} min)`;
    })
    .join("\n");
}

type VoiceKnowledgeMatch = {
  title?: string;
  text: string;
};

function matchesKnowledgeQuery(value: string, query: string): boolean {
  const normalizedValue = normalizeComparable(value);
  const normalizedQuery = normalizeComparable(query);

  if (!normalizedValue || !normalizedQuery) {
    return false;
  }

  if (normalizedValue.includes(normalizedQuery)) {
    return true;
  }

  const queryTokens = normalizedQuery
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

  return queryTokens.some((token) => normalizedValue.includes(token));
}

function buildSnapshotFallbackMatches(
  snapshot: BusinessContextSnapshot,
  query: string,
): Array<VoiceKnowledgeMatch> {
  const snippetMatches = (snapshot.knowledgeSnippets ?? []).flatMap((snippet) => {
    const text = snippet.content.trim();
    const comparableSnippet = [snippet.title, text].filter(Boolean).join(" ");
    if (!text || !matchesKnowledgeQuery(comparableSnippet, query)) {
      return [];
    }

    return [
      {
        title: snippet.title,
        text,
      } satisfies VoiceKnowledgeMatch,
    ];
  });
  const digest = snapshot.knowledgeDigest?.trim();
  return [
    ...snippetMatches,
    ...(digest && matchesKnowledgeQuery(digest, query)
      ? [
          {
            title: "Knowledge digest",
            text: digest,
          } satisfies VoiceKnowledgeMatch,
        ]
      : []),
  ];
}

function isTransferAllowed(snapshot: BusinessContextSnapshot): boolean {
  return snapshot.transferPolicy.mode !== "never" && Boolean(snapshot.transferPolicy.transferNumber);
}

const checkAvailabilitySchema = z.object({
  serviceName: z.string(),
  startsAt: z.string(),
  timezone: z.string().optional(),
  preferredStaffId: z.string().optional(),
});

const findAvailabilitySchema = z.object({
  serviceName: z.string(),
  date: z.string(),
  timezone: z.string().optional(),
  preferredStaffId: z.string().optional(),
  preferredHour24: z.number().int().min(0).max(23).optional(),
  preferredMinute: z.number().int().min(0).max(59).optional(),
  limit: z.number().int().min(1).max(12).optional(),
});

const bookAppointmentSchema = z.object({
  serviceName: z.string(),
  startsAt: z.string(),
  timezone: z.string().optional(),
  preferredStaffId: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
});

const verifyAppointmentForChangeSchema = z.object({
  appointmentId: z.string().optional(),
  action: z.enum(["cancel", "reschedule"]),
  callerName: z.string().optional(),
  appointmentStartsAt: z.string().optional(),
  serviceName: z.string().optional(),
});

const appointmentChangeOtpSchema = z.object({
  verificationId: z.string(),
});

const verifyAppointmentChangeOtpSchema = z.object({
  verificationId: z.string(),
  code: z.string(),
});

const cancelAppointmentSchema = z.object({
  appointmentId: z.string(),
  verificationId: z.string().optional(),
  finalConfirmation: z.boolean(),
});

const rescheduleAppointmentSchema = z.object({
  appointmentId: z.string(),
  startsAt: z.string(),
  timezone: z.string().optional(),
  preferredStaffId: z.string().optional(),
  verificationId: z.string().optional(),
  finalConfirmation: z.boolean(),
});

const transferCallSchema = z.object({
  reason: z.string().optional(),
});

const endCallSchema = z.object({
  reason: z.enum(["caller_finished", "abuse", "silence_timeout"]),
  message: z.string().min(1).max(500),
  severity: z.enum(["borderline", "severe"]).optional(),
});

const setCallHoldSchema = z.object({
  durationSeconds: z.number().int().min(1).max(600),
  reason: z.string().min(1).max(500),
});

const takeMessageSchema = z.object({
  callerName: z.string().optional(),
  callbackPhone: z.string().optional(),
  message: z.string(),
  urgency: z.string().optional(),
  callbackWindow: z.string().optional(),
});

const searchKnowledgeSchema = z.object({
  query: z.string(),
});

function safeAppointmentToolError(error: unknown): Record<string, unknown> {
  return {
    ok: false,
    reason: error instanceof Error ? error.message : "Appointment change failed.",
  };
}

export type ExecutedToolResult = {
  result: Record<string, unknown>;
  pendingTransferDestination?: string;
  endCall?: EndCallRequest;
  hold?: HoldGrantResult;
};

export async function executeVoiceTool(input: {
  toolName: string;
  rawArguments: string;
  snapshot: BusinessContextSnapshot;
  businessId: string;
  callId?: string;
  conversationId?: string;
  callerPhone: string;
  holdBudget?: {
    remainingHoldSeconds: number;
  };
}): Promise<ExecutedToolResult> {
  const startedAt = Date.now();
  const attributes = {
    "lobbystack.business_id": input.businessId,
    ...(input.callId ? { "lobbystack.call_id": input.callId } : {}),
    ...(input.conversationId
      ? { "lobbystack.conversation_id": input.conversationId }
      : {}),
    "lobbystack.model": process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime",
    "lobbystack.tool_name": input.toolName,
  };

  try {
    switch (input.toolName) {
          case "getBusinessHours": {
            return {
              result: {
                timezone: input.snapshot.timezone,
                summary: buildHoursSummary(input.snapshot),
                closures: input.snapshot.closures,
              },
            };
          }
          case "getBusinessServices": {
            return {
              result: {
                summary: buildServicesSummary(input.snapshot),
                services: input.snapshot.services,
                count: input.snapshot.services.length,
              },
            };
          }
          case "searchKnowledge": {
            const parsed = searchKnowledgeSchema.parse(JSON.parse(input.rawArguments || "{}"));
            try {
              const matches = await searchVoiceKnowledge({
                businessId: input.businessId,
                query: parsed.query,
              });

              if (matches.length > 0) {
                return {
                  result: {
                    matches,
                    source: "rag",
                    fallbackUsed: false,
                  },
                };
              }

              const fallbackMatches = buildSnapshotFallbackMatches(input.snapshot, parsed.query);
              if (fallbackMatches.length > 0) {
                return {
                  result: {
                    matches: fallbackMatches,
                    source: "snapshot_fallback",
                    fallbackUsed: true,
                    fallbackReason: "no_matches",
                  },
                };
              }

              return {
                result: {
                  matches: [],
                  source: "none",
                  fallbackUsed: false,
                },
              };
            } catch {
              const fallbackMatches = buildSnapshotFallbackMatches(input.snapshot, parsed.query);
              if (fallbackMatches.length > 0) {
                return {
                  result: {
                    matches: fallbackMatches,
                    source: "snapshot_fallback",
                    fallbackUsed: true,
                    fallbackReason: "rag_error",
                  },
                };
              }

              return {
                result: {
                  matches: [],
                  source: "none",
                  fallbackUsed: false,
                },
              };
            }
          }
          case "checkAvailability": {
            const parsed = checkAvailabilitySchema.parse(JSON.parse(input.rawArguments || "{}"));
            const result = await checkVoiceAvailability({
              businessId: input.businessId,
              serviceName: parsed.serviceName,
              startsAt: parsed.startsAt,
              timezone: parsed.timezone ?? input.snapshot.timezone,
              ...(parsed.preferredStaffId !== undefined
                ? { preferredStaffId: parsed.preferredStaffId }
                : {}),
            });
            return {
              result,
            };
          }
          case "findAvailability": {
            const parsed = findAvailabilitySchema.parse(JSON.parse(input.rawArguments || "{}"));
            const result = await findVoiceAvailability({
              businessId: input.businessId,
              serviceName: parsed.serviceName,
              date: parsed.date,
              timezone: parsed.timezone ?? input.snapshot.timezone,
              ...(parsed.preferredStaffId !== undefined
                ? { preferredStaffId: parsed.preferredStaffId }
                : {}),
              ...(parsed.preferredHour24 !== undefined
                ? { preferredHour24: parsed.preferredHour24 }
                : {}),
              ...(parsed.preferredMinute !== undefined
                ? { preferredMinute: parsed.preferredMinute }
                : {}),
              ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
            });
            return {
              result,
            };
          }
          case "bookAppointment": {
            const parsed = bookAppointmentSchema.parse(JSON.parse(input.rawArguments || "{}"));
            const result = await bookVoiceAppointment({
              businessId: input.businessId,
              serviceName: parsed.serviceName,
              startsAt: parsed.startsAt,
              timezone: parsed.timezone ?? input.snapshot.timezone,
              ...(parsed.preferredStaffId !== undefined
                ? { preferredStaffId: parsed.preferredStaffId }
                : {}),
              ...(input.conversationId !== undefined
                ? { conversationId: input.conversationId }
                : {}),
              ...(parsed.contactName !== undefined ? { contactName: parsed.contactName } : {}),
              contactPhone: parsed.contactPhone ?? input.callerPhone,
            });
            return {
              result,
            };
          }
          case "lookupAppointmentForChange": {
            try {
              const result = await lookupVoiceAppointmentForChange({
                businessId: input.businessId,
                callerPhone: input.callerPhone,
              });
              return { result };
            } catch (error) {
              return { result: safeAppointmentToolError(error) };
            }
          }
          case "verifyAppointmentForChange": {
            const parsed = verifyAppointmentForChangeSchema.parse(JSON.parse(input.rawArguments || "{}"));
            try {
              const result = await verifyVoiceAppointmentForChange({
                businessId: input.businessId,
                action: parsed.action,
                callerPhone: input.callerPhone,
                ...(parsed.appointmentId !== undefined ? { appointmentId: parsed.appointmentId } : {}),
                ...(parsed.callerName !== undefined ? { callerName: parsed.callerName } : {}),
                ...(parsed.appointmentStartsAt !== undefined
                  ? { appointmentStartsAt: parsed.appointmentStartsAt }
                  : {}),
                ...(parsed.serviceName !== undefined ? { serviceName: parsed.serviceName } : {}),
                ...(input.callId !== undefined ? { callId: input.callId } : {}),
                ...(input.conversationId !== undefined
                  ? { conversationId: input.conversationId }
                  : {}),
              });
              return { result };
            } catch (error) {
              return { result: safeAppointmentToolError(error) };
            }
          }
          case "sendAppointmentChangeOtp": {
            const parsed = appointmentChangeOtpSchema.parse(JSON.parse(input.rawArguments || "{}"));
            try {
              const result = await sendVoiceAppointmentChangeOtp({
                verificationId: parsed.verificationId,
              });
              return { result };
            } catch (error) {
              return { result: safeAppointmentToolError(error) };
            }
          }
          case "verifyAppointmentChangeOtp": {
            const parsed = verifyAppointmentChangeOtpSchema.parse(JSON.parse(input.rawArguments || "{}"));
            try {
              const result = await verifyVoiceAppointmentChangeOtp({
                verificationId: parsed.verificationId,
                code: parsed.code,
              });
              return { result };
            } catch (error) {
              return { result: safeAppointmentToolError(error) };
            }
          }
          case "cancelAppointment": {
            const parsed = cancelAppointmentSchema.parse(JSON.parse(input.rawArguments || "{}"));
            try {
              const result = await cancelVoiceAppointment({
                businessId: input.businessId,
                appointmentId: parsed.appointmentId,
                callerPhone: input.callerPhone,
                finalConfirmation: parsed.finalConfirmation,
                ...(parsed.verificationId !== undefined
                  ? { verificationId: parsed.verificationId }
                  : {}),
                ...(input.callId !== undefined ? { callId: input.callId } : {}),
                ...(input.conversationId !== undefined
                  ? { conversationId: input.conversationId }
                  : {}),
              });
              return { result };
            } catch (error) {
              return { result: safeAppointmentToolError(error) };
            }
          }
          case "rescheduleAppointment": {
            const parsed = rescheduleAppointmentSchema.parse(JSON.parse(input.rawArguments || "{}"));
            try {
              const result = await rescheduleVoiceAppointment({
                businessId: input.businessId,
                appointmentId: parsed.appointmentId,
                callerPhone: input.callerPhone,
                startsAt: parsed.startsAt,
                timezone: parsed.timezone ?? input.snapshot.timezone,
                ...(parsed.preferredStaffId !== undefined
                  ? { preferredStaffId: parsed.preferredStaffId }
                  : {}),
                finalConfirmation: parsed.finalConfirmation,
                ...(parsed.verificationId !== undefined
                  ? { verificationId: parsed.verificationId }
                  : {}),
                ...(input.callId !== undefined ? { callId: input.callId } : {}),
                ...(input.conversationId !== undefined
                  ? { conversationId: input.conversationId }
                  : {}),
              });
              return { result };
            } catch (error) {
              return { result: safeAppointmentToolError(error) };
            }
          }
          case "transferCall": {
            const parsed = transferCallSchema.parse(JSON.parse(input.rawArguments || "{}"));
            if (!isTransferAllowed(input.snapshot) || !input.snapshot.transferPolicy.transferNumber) {
              return {
                result: {
                  ok: false,
                  reason:
                    "Transfers are not enabled for this business or no transfer number is configured.",
                },
              };
            }

            if (input.callId) {
              await updateVoiceTransferState({
                callId: input.callId,
                transferState: "requested",
              });
            }

            return {
              result: {
                ok: true,
                destination: input.snapshot.transferPolicy.transferNumber,
                reason: parsed.reason ?? "Caller requested a human handoff.",
              },
              pendingTransferDestination: input.snapshot.transferPolicy.transferNumber,
            };
          }
          case "endCall": {
            const parsed = endCallSchema.parse(JSON.parse(input.rawArguments || "{}"));
            return {
              result: {
                ok: true,
                reason: parsed.reason,
                message: parsed.message,
                ...(parsed.severity !== undefined ? { severity: parsed.severity } : {}),
              },
              endCall: {
                reason: parsed.reason,
                message: parsed.message,
                ...(parsed.severity !== undefined ? { severity: parsed.severity } : {}),
              },
            };
          }
          case "setCallHold": {
            const parsed = setCallHoldSchema.parse(JSON.parse(input.rawArguments || "{}"));
            const remainingHoldSeconds =
              input.holdBudget?.remainingHoldSeconds ?? MAX_CUMULATIVE_HOLD_SECONDS;
            const grantedDurationSeconds = Math.min(
              parsed.durationSeconds,
              MAX_SINGLE_HOLD_SECONDS,
              Math.max(0, remainingHoldSeconds),
            );

            if (grantedDurationSeconds <= 0) {
              const hold: HoldGrantResult = {
                ok: false,
                requestedDurationSeconds: parsed.durationSeconds,
                grantedDurationSeconds: 0,
                remainingHoldSeconds: 0,
                capped: true,
                reason: parsed.reason,
                error: "hold_limit_reached",
              };
              return {
                result: hold,
                hold,
              };
            }

            const hold: HoldGrantResult = {
              ok: true,
              requestedDurationSeconds: parsed.durationSeconds,
              grantedDurationSeconds,
              remainingHoldSeconds: Math.max(0, remainingHoldSeconds - grantedDurationSeconds),
              capped: grantedDurationSeconds < parsed.durationSeconds,
              reason: parsed.reason,
            };

            return {
              result: hold,
              hold,
            };
          }
          case "takeMessage": {
            const parsed = takeMessageSchema.parse(JSON.parse(input.rawArguments || "{}"));
            if (!input.callId) {
              throw new Error("Call has not been initialized yet.");
            }

            const result = await takeVoiceMessage({
              businessId: input.businessId,
              callId: input.callId,
              ...(input.conversationId !== undefined
                ? { conversationId: input.conversationId }
                : {}),
              ...(parsed.callerName !== undefined ? { callerName: parsed.callerName } : {}),
              callbackPhone: parsed.callbackPhone ?? input.callerPhone,
              message: parsed.message,
              ...(parsed.urgency !== undefined ? { urgency: parsed.urgency } : {}),
              ...(parsed.callbackWindow !== undefined
                ? { callbackWindow: parsed.callbackWindow }
                : {}),
            });
            return {
              result,
            };
          }
          default: {
            return {
              result: {
                ok: false,
                reason: `Unsupported tool: ${input.toolName}`,
              },
            };
          }
        }
  } catch (error) {
    recordToolExecutionFailure(attributes);
    throw error;
  } finally {
    recordToolExecutionLatency(Date.now() - startedAt, attributes);
  }
}
