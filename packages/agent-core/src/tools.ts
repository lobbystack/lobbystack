import {
  bookForCaller,
  cancelForCaller,
  checkOpening,
  findOpenings,
  issueAppointmentChangeOtp,
  lookupCallerAppointments,
  rescheduleForCaller,
  searchKnowledgeEvidence,
  takeMessageForStaff,
  verifyAppointmentChangeOtp,
  verifyCallerForChange,
  type DomainContext,
} from "@lobbystack/domain";
import {
  isTransferPermitted,
  normalizeAppointmentChangePolicy,
  normalizeBookingMode,
  type BusinessContextSnapshot,
} from "@lobbystack/shared";
import { tool, type ToolSet } from "ai";
import { DateTime } from "luxon";
import { z } from "zod";

/** Where the conversation happens. Phone calls know the caller's number. */
export type AgentChannel = "voice" | "web_voice" | "web_chat";

/** Live-call controls the agent can use. Only phone calls provide them. */
export type CallControl = {
  /**
   * Phone calls only.
   * Resolves false when the transfer can't start, for example when
   * the plan is out of transfer attempts.
   */
  transfer?(destination: string): Promise<boolean>;

  hangup(
    reason: "caller_finished" | "spam" | "abuse",
  ): Promise<void>;
};

export type AgentToolContext = {
  domain: DomainContext;

  snapshot: BusinessContextSnapshot;

  channel: AgentChannel;

  /**
   * Verified caller ID on phone calls.
   * Never set from what a visitor types.
   */
  callerPhone?: string;

  callId?: string;

  conversationId?: string;

  callControl?: CallControl;

  /**
   * Prospect demos only answer questions and take messages:
   * no booking and no transfers.
   */
  intakeOnly?: boolean;
};

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatMinutes(
  minutes: number,
): string {
  return DateTime.fromObject({
    hour: Math.floor(minutes / 60),
    minute: minutes % 60,
  }).toFormat("h:mm a");
}

function comparable(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
}

/**
 * Curated FAQ snippets from the snapshot back up knowledge search when the
 * actual indexed document search finds nothing or is unavailable.
 *
 * IMPORTANT:
 * The document digest is an inventory, not evidence.
 */
function snapshotKnowledgeMatches(
  snapshot: BusinessContextSnapshot,
  query: string,
) {
  const wanted =
    comparable(query);

  const tokens = wanted
    .split(" ")
    .filter(
      (token) =>
        token.length >= 3,
    );

  return (
    snapshot.knowledgeSnippets ??
    []
  ).flatMap((snippet) => {
    const text = comparable(
      `${snippet.title} ${snippet.content}`,
    );

    if (
      !wanted ||
      !(
        text.includes(wanted) ||
        tokens.some((token) =>
          text.includes(token),
        )
      )
    ) {
      return [];
    }

    return [
      {
        title: snippet.title,
        text:
          snippet.content.trim(),
      },
    ];
  });
}

const phone = z
  .string()
  .describe(
    "Phone number in E.164 format, for example +14165550134.",
  );

export function createReceptionistTools(
  context: AgentToolContext,
): ToolSet {
  const {
    domain,
    snapshot,
  } = context;

  const businessId =
    snapshot.businessId;

  const timezone =
    snapshot.timezone;

  const bookingMode =
    context.intakeOnly
      ? "off"
      : normalizeBookingMode(
          snapshot.bookingMode,
        );

  const channel =
    context.channel;

  const tools: ToolSet = {
    getBusinessHours: tool({
      description:
        "Get the business's weekly opening hours, upcoming closures, and whether it is open right now.",

      inputSchema:
        z.object({}),

      execute: async () => {
        const now =
          DateTime.now().setZone(
            timezone,
          );

        const minutesNow =
          now.hour * 60 +
          now.minute;

        const today =
          now.weekday % 7;

        const openNow =
          snapshot.hours.some(
            (window) =>
              window.dayOfWeek ===
                today &&
              minutesNow >=
                window.openMinutes &&
              minutesNow <
                window.closeMinutes,
          ) &&
          !snapshot.closures.some(
            (closure) =>
              now >=
                DateTime.fromISO(
                  closure.startsAt,
                ) &&
              now <
                DateTime.fromISO(
                  closure.endsAt,
                ),
          );

        return {
          timezone,

          now: now.toFormat(
            "cccc h:mm a",
          ),

          openNow,

          configured:
            snapshot.hours
              .length > 0,

          weekly:
            DAY_NAMES.map(
              (
                day,
                index,
              ) => {
                const windows =
                  snapshot.hours.filter(
                    (window) =>
                      window.dayOfWeek ===
                      index,
                  );

                return `${day}: ${
                  windows.length
                    ? windows
                        .map(
                          (
                            window,
                          ) =>
                            `${formatMinutes(
                              window.openMinutes,
                            )} to ${formatMinutes(
                              window.closeMinutes,
                            )}`,
                        )
                        .join(", ")
                    : "closed"
                }`;
              },
            ),

          upcomingClosures:
            snapshot.closures
              .filter(
                (closure) =>
                  DateTime.fromISO(
                    closure.endsAt,
                  ) > now,
              )
              .map(
                (closure) => ({
                  from:
                    closure.startsAt,

                  to:
                    closure.endsAt,

                  reason:
                    closure.reason,
                }),
              ),
        };
      },
    }),

    getBusinessServices:
      tool({
        description:
          "List the services the business offers, with duration and a short description.",

        inputSchema:
          z.object({}),

        execute:
          async () => ({
            services:
              snapshot.services.map(
                (service) => ({
                  name:
                    service.name,

                  durationMinutes:
                    service.durationMinutes,

                  ...(service.description
                    ? {
                        description:
                          service.description,
                      }
                    : {}),
                }),
              ),
          }),
      }),

    /**
     * Search uploaded documents and other indexed long-form business knowledge.
     *
     * IMPORTANT:
     * Indexed RAG evidence is authoritative for document questions.
     * Snapshot FAQ snippets are only used when RAG returns no evidence.
     */
    searchKnowledge: tool({
      description:
        "Search the business's stored knowledge and uploaded documents. Use this for budgets, financial amounts, strata fees, insurance, bylaws, meeting minutes, policies, rules, parking, building procedures, notices, prices, payment methods, and any other business-specific fact that is not explicitly present in the instructions. Never guess. Make the query self-contained and include important identifiers such as year, document type, unit number, subject, or amount category.",

      inputSchema:
        z.object({
          query: z
            .string()
            .describe(
              "A self-contained search query describing exactly what business fact or document information is needed.",
            ),
        }),

      execute: async ({
        query,
      }) => {
        const startedAt =
          performance.now();

        const fallback =
          snapshotKnowledgeMatches(
            snapshot,
            query,
          );

        /**
         * Diagnostic logging.
         *
         * This temporarily logs the generated RAG query so we can see exactly
         * what the backend agent asks the knowledge system.
         *
         * Once troubleshooting is complete you may want to remove `query`
         * from these logs because it can contain caller-derived text.
         */
        console.info(
          JSON.stringify({
            event:
              "knowledge.search.started",

            businessId,

            callId:
              context.callId ??
              null,

            channel,

            query,

            fallbackCount:
              fallback.length,
          }),
        );

        try {
          const evidence =
            await searchKnowledgeEvidence(
              domain,
              {
                businessId,

                query,

                limit: 6,

                ...(context.callId
                  ? {
                      callId:
                        context.callId,
                    }
                  : {}),
              },
            );

          const evidenceMatches =
            evidence.matches.map(
              (match) => ({
                title:
                  match.title,

                text:
                  match.content,
              }),
            );

          /**
           * CRITICAL FIX
           *
           * Previous LobbyStack behavior effectively did:
           *
           *   [
           *     ...fallback,
           *     ...evidenceMatches
           *   ].slice(0, 6)
           *
           * If there were 6+ snapshot fallback snippets, the real document
           * evidence was completely removed from the tool response even though
           * searchKnowledgeEvidence had successfully retrieved it.
           *
           * For example our diagnostics showed:
           *
           *   fallbackCount:       8
           *   evidenceResultCount: 4
           *   resultCount:         6
           *
           * which meant the first six fallback items displaced all four RAG
           * passages.
           *
           * Indexed document evidence must therefore take precedence.
           */
          const matches =
            evidenceMatches.length >
            0
              ? evidenceMatches.slice(
                  0,
                  6,
                )
              : fallback.slice(
                  0,
                  6,
                );

          const outcome =
            matches.length > 0
              ? "found"
              : evidence.outcome;

          const titles = [
            ...new Set(
              evidence.matches.map(
                (match) =>
                  match.title,
              ),
            ),
          ];

          const documentIds =
            [
              ...new Set(
                evidence.matches.map(
                  (match) =>
                    match.documentId,
                ),
              ),
            ];

          const sequences =
            evidence.matches.map(
              (match) =>
                match.sequence,
            );

          console.info(
            JSON.stringify({
              event:
                "knowledge.search.completed",

              businessId,

              callId:
                context.callId ??
                null,

              channel,

              query,

              outcome,

              mode:
                evidence.mode,

              failure:
                evidence.failure ??
                null,

              /**
               * Number of items actually returned to the backend agent.
               */
              resultCount:
                matches.length,

              /**
               * Number of actual indexed-document passages retrieved.
               */
              evidenceResultCount:
                evidence.matches
                  .length,

              fallbackCount:
                fallback.length,

              /**
               * This is the most useful field for verifying the fix.
               */
              source:
                evidenceMatches.length >
                0
                  ? "rag"
                  : "snapshot_fallback",

              titles,

              documentIds,

              sequences,

              durationMs:
                Math.round(
                  evidence.durationMs,
                ),

              totalToolMs:
                Math.round(
                  performance.now() -
                    startedAt,
                ),
            }),
          );

          return {
            outcome,
            matches,
          };
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : String(error);

          console.error(
            JSON.stringify({
              event:
                "knowledge.search.failed",

              businessId,

              callId:
                context.callId ??
                null,

              channel,

              query,

              error:
                errorMessage,

              fallbackCount:
                fallback.length,

              totalToolMs:
                Math.round(
                  performance.now() -
                    startedAt,
                ),
            }),
          );

          /**
           * If the indexed document search genuinely fails, fall back to the
           * curated snapshot snippets.
           */
          return {
            outcome:
              fallback.length > 0
                ? "found"
                : "unavailable",

            matches:
              fallback.slice(
                0,
                6,
              ),
          };
        }
      },
    }),

    takeMessage: tool({
      description:
        "Save a message for the team to follow up on: a callback request, a question you couldn't answer, or anything the caller wants passed on. Get their name and a callback number first.",

      inputSchema:
        z.object({
          message: z
            .string()
            .describe(
              "What the caller needs, summarized for staff.",
            ),

          callerName:
            z.string().optional(),

          callbackPhone:
            phone.optional(),

          urgency: z
            .enum([
              "low",
              "normal",
              "urgent",
            ])
            .optional(),

          callbackWindow: z
            .string()
            .optional()
            .describe(
              "When the caller prefers to be called back, in their words.",
            ),
        }),

      execute:
        async (input) => {
          const callbackPhone =
            input.callbackPhone ??
            context.callerPhone;

          return await takeMessageForStaff(
            domain,
            {
              businessId,

              message:
                input.message,

              channel,

              ...(callbackPhone
                ? {
                    callbackPhone,
                  }
                : {}),

              ...(input.callerName
                ? {
                    callerName:
                      input.callerName,
                  }
                : {}),

              ...(input.urgency
                ? {
                    urgency:
                      input.urgency,
                  }
                : {}),

              ...(input.callbackWindow
                ? {
                    callbackWindow:
                      input.callbackWindow,
                  }
                : {}),

              ...(context.callId
                ? {
                    callId:
                      context.callId,
                  }
                : {}),

              ...(context.conversationId
                ? {
                    conversationId:
                      context.conversationId,
                  }
                : {}),
            },
          );
        },
    }),
  };

  if (
    bookingMode ===
    "instant"
  ) {
    tools.findAvailability =
      tool({
        description:
          "Find open appointment times for one service on one date. Never state availability without calling this.",

        inputSchema:
          z.object({
            serviceName: z
              .string()
              .describe(
                "One of the business's services.",
              ),

            date: z
              .string()
              .describe(
                "Date as YYYY-MM-DD in the business's timezone.",
              ),

            preferredTime: z
              .string()
              .optional()
              .describe(
                "Preferred start time as HH:mm (24-hour).",
              ),
          }),

        execute: async ({
          serviceName,
          date,
          preferredTime,
        }) => {
          const [
            hour,
            minute,
          ] = (
            preferredTime ??
            ""
          )
            .split(":")
            .map(Number);

          return await findOpenings(
            domain,
            {
              businessId,

              serviceName,

              date,

              timezone,

              hours:
                snapshot.hours,

              ...(Number.isFinite(
                hour,
              )
                ? {
                    preferredHour24:
                      hour,

                    preferredMinute:
                      Number.isFinite(
                        minute,
                      )
                        ? minute
                        : 0,
                  }
                : {}),

              ...(context.callId
                ? {
                    callId:
                      context.callId,
                  }
                : {}),
            },
          );
        },
      });

    tools.bookAppointment =
      tool({
        description:
          "Book an appointment at a time findAvailability returned, after the caller confirms the service and time. On phone calls, ask first whether you may text a confirmation and reminder, and pass their answer.",

        inputSchema:
          z.object({
            serviceName:
              z.string(),

            startsAt: z
              .string()
              .describe(
                "The exact startsAt value returned by findAvailability.",
              ),

            contactName:
              z
                .string()
                .optional(),

            contactPhone:
              phone
                .optional()
                .describe(
                  "Required when the caller's number isn't already known.",
                ),

            smsConsentGranted:
              z
                .boolean()
                .describe(
                  "True only if the caller agreed to receive a confirmation and reminder text.",
                ),
          }),

        execute:
          async (input) => {
            const contactPhone =
              input.contactPhone ??
              context.callerPhone;

            if (
              !contactPhone
            ) {
              return {
                ok: false,

                reason:
                  "Ask for a phone number before booking.",
              };
            }

            const opening =
              await checkOpening(
                domain,
                {
                  businessId,

                  serviceName:
                    input.serviceName,

                  startsAt:
                    input.startsAt,

                  timezone,

                  ...(context.callId
                    ? {
                        callId:
                          context.callId,
                      }
                    : {}),
                },
              );

            if (
              !opening.ok ||
              !opening.available
            ) {
              return {
                ok: false,

                reason:
                  "That time is no longer available. Offer another opening.",
              };
            }

            return await bookForCaller(
              domain,
              {
                businessId,

                serviceName:
                  input.serviceName,

                startsAt:
                  input.startsAt,

                timezone,

                contactPhone,

                channel,

                smsConsentGranted:
                  input.smsConsentGranted,

                ...(input.contactName
                  ? {
                      contactName:
                        input.contactName,
                    }
                  : {}),

                ...(context.callId
                  ? {
                      callId:
                        context.callId,
                    }
                  : {}),
              },
            );
          },
      });
  }

  if (
    bookingMode ===
    "request"
  ) {
    tools.requestAppointment =
      tool({
        description:
          "Pass an appointment request to the team, who will confirm the time with the caller. Collect the service, preferred day and time, name, and callback number first.",

        inputSchema:
          z.object({
            serviceName:
              z.string(),

            preferredTime: z
              .string()
              .describe(
                "The caller's preferred day and time, in their words.",
              ),

            callerName:
              z.string(),

            callbackPhone:
              phone.optional(),

            notes: z
              .string()
              .optional(),
          }),

        execute:
          async (input) => {
            const callbackPhone =
              input.callbackPhone ??
              context.callerPhone;

            if (
              !callbackPhone
            ) {
              return {
                ok: false,

                reason:
                  "Ask for a callback number first.",
              };
            }

            const message = [
              `Appointment request: ${input.serviceName}`,

              `Preferred time: ${input.preferredTime}`,

              input.notes
                ? `Notes: ${input.notes}`
                : "",
            ]
              .filter(Boolean)
              .join("\n");

            return await takeMessageForStaff(
              domain,
              {
                businessId,

                message,

                channel,

                callbackPhone,

                callerName:
                  input.callerName,

                ...(context.callId
                  ? {
                      callId:
                        context.callId,
                    }
                  : {}),

                ...(context.conversationId
                  ? {
                      conversationId:
                        context.conversationId,
                    }
                  : {}),
              },
            );
          },
      });
  }

  /**
   * Changing an appointment identifies the caller by their phone number,
   * so these tools are only offered when the call itself carries a trusted
   * number.
   */
  const changePolicy =
    normalizeAppointmentChangePolicy(
      snapshot.appointmentChangePolicy,
    );

  const callerPhone =
    context.callerPhone;

  if (
    callerPhone &&
    changePolicy.enabled &&
    changePolicy.verificationMode !==
      "operator_only" &&
    bookingMode !== "off"
  ) {
    tools.lookupAppointmentForChange =
      tool({
        description:
          "Check whether this caller's number has upcoming appointments before cancelling or rescheduling. It does not reveal appointment details.",

        inputSchema:
          z.object({}),

        execute:
          async () =>
            await lookupCallerAppointments(
              domain,
              {
                businessId,
                callerPhone,
              },
            ),
      });

    tools.verifyAppointmentForChange =
      tool({
        description:
          "Verify the caller's name and one fact about their appointment (date/time or service) before any change.",

        inputSchema:
          z.object({
            action: z.enum([
              "cancel",
              "reschedule",
            ]),

            callerName: z
              .string()
              .optional(),

            appointmentStartsAt:
              z
                .string()
                .optional()
                .describe(
                  "The appointment time as the caller described it.",
                ),

            serviceName: z
              .string()
              .optional(),
          }),

        execute:
          async (input) =>
            await verifyCallerForChange(
              domain,
              {
                businessId,

                callerPhone,

                action:
                  input.action,

                ...(input.callerName
                  ? {
                      callerName:
                        input.callerName,
                    }
                  : {}),

                ...(input.appointmentStartsAt
                  ? {
                      appointmentStartsAt:
                        input.appointmentStartsAt,
                    }
                  : {}),

                ...(input.serviceName
                  ? {
                      serviceName:
                        input.serviceName,
                    }
                  : {}),
              },
            ),
      });

    tools.sendAppointmentChangeOtp =
      tool({
        description:
          "Text the caller a one-time code when verifyAppointmentForChange says a code is required.",

        inputSchema:
          z.object({
            verificationId:
              z.string(),
          }),

        execute:
          async ({
            verificationId,
          }) =>
            await issueAppointmentChangeOtp(
              domain,
              {
                businessId,
                verificationId,
              },
            ),
      });

    tools.verifyAppointmentChangeOtp =
      tool({
        description:
          "Check the one-time code the caller reads back.",

        inputSchema:
          z.object({
            verificationId:
              z.string(),

            code:
              z.string(),
          }),

        execute:
          async ({
            verificationId,
            code,
          }) =>
            await verifyAppointmentChangeOtp(
              domain,
              {
                businessId,
                verificationId,
                code,
              },
            ),
      });

    if (
      changePolicy.allowCancel
    ) {
      tools.cancelAppointment =
        tool({
          description:
            "Cancel the verified appointment. Only after the caller explicitly confirms they want it cancelled now.",

          inputSchema:
            z.object({
              appointmentId:
                z.string(),

              verificationId:
                z.string(),

              finalConfirmation:
                z.boolean(),
            }),

          execute:
            async (input) =>
              await cancelForCaller(
                domain,
                {
                  businessId,
                  callerPhone,
                  ...input,
                },
              ),
        });
    }

    if (
      changePolicy.allowReschedule &&
      bookingMode ===
        "instant"
    ) {
      tools.rescheduleAppointment =
        tool({
          description:
            "Move the verified appointment to a new time that findAvailability returned. Only after the caller explicitly confirms the new time.",

          inputSchema:
            z.object({
              appointmentId:
                z.string(),

              verificationId:
                z.string(),

              startsAt:
                z.string(),

              finalConfirmation:
                z.boolean(),
            }),

          execute:
            async (input) =>
              await rescheduleForCaller(
                domain,
                {
                  businessId,
                  callerPhone,
                  ...input,
                },
              ),
        });
    }
  }

  const callControl =
    context.callControl;

  const transfer =
    context.intakeOnly
      ? undefined
      : callControl?.transfer?.bind(
          callControl,
        );

  if (transfer) {
    tools.transferCall =
      tool({
        description:
          "Transfer the call to a person at the business when the transfer rules allow it and the caller asks for a person or has an urgent problem.",

        inputSchema:
          z.object({
            callerRequested:
              z
                .boolean()
                .describe(
                  "True only if the caller explicitly asked for a person.",
                ),

            urgent:
              z
                .boolean()
                .describe(
                  "True only if the caller described an urgent situation.",
                ),

            reason: z
              .string()
              .optional(),
          }),

        execute:
          async (input) => {
            const destination =
              snapshot
                .transferPolicy
                .transferNumber;

            if (
              !destination ||
              !isTransferPermitted(
                snapshot,
                input,
              )
            ) {
              return {
                ok: false,

                reason:
                  "Transfers aren't allowed right now. Offer to take a message.",
              };
            }

            const started =
              await transfer(
                destination,
              );

            return started
              ? {
                  ok: true,
                  transferring:
                    true,
                }
              : {
                  ok: false,

                  reason:
                    "The transfer couldn't be started. Offer to take a message.",
                };
          },
      });
  }

  if (callControl) {
    tools.endCall = tool({
      description:
        "Hang up after saying goodbye, when the caller is done, or when the call is spam or abusive.",

      inputSchema:
        z.object({
          reason: z.enum([
            "caller_finished",
            "spam",
            "abuse",
          ]),
        }),

      execute:
        async ({
          reason,
        }) => {
          await callControl.hangup(
            reason,
          );

          return {
            ok: true,
          };
        },
    });
  }

  return tools;
}
