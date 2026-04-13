import type { BusinessContextSnapshot } from "@ai-receptionist/shared";
import { z } from "zod";

import {
  recordToolExecutionFailure,
  recordToolExecutionLatency,
} from "../observability/posthog";
import {
  bookVoiceAppointment,
  checkVoiceAvailability,
  findVoiceAvailability,
  searchVoiceKnowledge,
  takeVoiceMessage,
  updateVoiceTransferState,
} from "../convex/runtimeClient";

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

const transferCallSchema = z.object({
  reason: z.string().optional(),
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

export type ExecutedToolResult = {
  result: Record<string, unknown>;
  pendingTransferDestination?: string;
};

export async function executeVoiceTool(input: {
  toolName: string;
  rawArguments: string;
  snapshot: BusinessContextSnapshot;
  businessId: string;
  callId?: string;
  conversationId?: string;
  callerPhone: string;
}): Promise<ExecutedToolResult> {
  const startedAt = Date.now();
  const attributes = {
    "ai_receptionist.business_id": input.businessId,
    ...(input.callId ? { "ai_receptionist.call_id": input.callId } : {}),
    ...(input.conversationId
      ? { "ai_receptionist.conversation_id": input.conversationId }
      : {}),
    "ai_receptionist.model": process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime",
    "ai_receptionist.tool_name": input.toolName,
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
