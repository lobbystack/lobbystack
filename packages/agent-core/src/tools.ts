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
import { isTransferPermitted, normalizeAppointmentChangePolicy, normalizeBookingMode, type BusinessContextSnapshot } from "@lobbystack/shared";
import { tool, type ToolSet } from "ai";
import { DateTime } from "luxon";
import { z } from "zod";

/** Where the conversation happens. Phone calls know the caller's number. */
export type AgentChannel = "voice" | "web_voice" | "web_chat";

/** Live-call controls the agent can use. Only phone calls provide them. */
export type CallControl = {
  transfer(destination: string): Promise<void>;
  hangup(): Promise<void>;
};

export type AgentToolContext = {
  domain: DomainContext;
  snapshot: BusinessContextSnapshot;
  channel: AgentChannel;
  /** Verified caller ID on phone calls. Never set from what a visitor types. */
  callerPhone?: string;
  callId?: string;
  conversationId?: string;
  callControl?: CallControl;
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatMinutes(minutes: number): string {
  return DateTime.fromObject({ hour: Math.floor(minutes / 60), minute: minutes % 60 }).toFormat("h:mm a");
}

function comparable(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

// Curated FAQs from the snapshot back up knowledge search when it finds nothing
// or is unavailable. The document digest is an inventory, not evidence.
function snapshotKnowledgeMatches(snapshot: BusinessContextSnapshot, query: string) {
  const wanted = comparable(query);
  const tokens = wanted.split(" ").filter((token) => token.length >= 3);
  return (snapshot.knowledgeSnippets ?? []).flatMap((snippet) => {
    const text = comparable(`${snippet.title} ${snippet.content}`);
    if (!wanted || !(text.includes(wanted) || tokens.some((token) => text.includes(token)))) return [];
    return [{ title: snippet.title, text: snippet.content.trim() }];
  });
}

const phone = z.string().describe("Phone number in E.164 format, for example +14165550134.");

export function createReceptionistTools(context: AgentToolContext): ToolSet {
  const { domain, snapshot } = context;
  const businessId = snapshot.businessId;
  const timezone = snapshot.timezone;
  const bookingMode = normalizeBookingMode(snapshot.bookingMode);
  const channel = context.channel;
  const tools: ToolSet = {
    getBusinessHours: tool({
      description: "Get the business's weekly opening hours, upcoming closures, and whether it is open right now.",
      inputSchema: z.object({}),
      execute: async () => {
        const now = DateTime.now().setZone(timezone);
        const minutesNow = now.hour * 60 + now.minute;
        const today = now.weekday % 7;
        const openNow = snapshot.hours.some((window) => window.dayOfWeek === today && minutesNow >= window.openMinutes && minutesNow < window.closeMinutes)
          && !snapshot.closures.some((closure) => now >= DateTime.fromISO(closure.startsAt) && now < DateTime.fromISO(closure.endsAt));
        return {
          timezone,
          now: now.toFormat("cccc h:mm a"),
          openNow,
          configured: snapshot.hours.length > 0,
          weekly: DAY_NAMES.map((day, index) => {
            const windows = snapshot.hours.filter((window) => window.dayOfWeek === index);
            return `${day}: ${windows.length ? windows.map((window) => `${formatMinutes(window.openMinutes)} to ${formatMinutes(window.closeMinutes)}`).join(", ") : "closed"}`;
          }),
          upcomingClosures: snapshot.closures
            .filter((closure) => DateTime.fromISO(closure.endsAt) > now)
            .map((closure) => ({ from: closure.startsAt, to: closure.endsAt, reason: closure.reason })),
        };
      },
    }),

    getBusinessServices: tool({
      description: "List the services the business offers, with duration and a short description.",
      inputSchema: z.object({}),
      execute: async () => ({
        services: snapshot.services.map((service) => ({ name: service.name, durationMinutes: service.durationMinutes, ...(service.description ? { description: service.description } : {}) })),
      }),
    }),

    searchKnowledge: tool({
      description: "Look up any business-specific fact not in your instructions: prices, policies, parking, payment methods, what to bring, and so on. Never guess. Make the query self-contained.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const fallback = snapshotKnowledgeMatches(snapshot, query);
        try {
          const evidence = await searchKnowledgeEvidence(domain, { businessId, query, limit: 6, ...(context.callId ? { callId: context.callId } : {}) });
          const matches = [...fallback, ...evidence.matches.map((match) => ({ title: match.title, text: match.content }))].slice(0, 6);
          return { outcome: matches.length ? "found" : evidence.outcome, matches };
        } catch {
          return { outcome: fallback.length ? "found" : "unavailable", matches: fallback };
        }
      },
    }),

    takeMessage: tool({
      description: "Save a message for the team to follow up on: a callback request, a question you couldn't answer, or anything the caller wants passed on. Get their name and a callback number first.",
      inputSchema: z.object({
        message: z.string().describe("What the caller needs, summarized for staff."),
        callerName: z.string().optional(),
        callbackPhone: phone.optional(),
        urgency: z.enum(["low", "normal", "urgent"]).optional(),
        callbackWindow: z.string().optional().describe("When the caller prefers to be called back, in their words."),
      }),
      execute: async (input) => {
        const callbackPhone = input.callbackPhone ?? context.callerPhone;
        return await takeMessageForStaff(domain, {
          businessId,
          message: input.message,
          channel,
          ...(callbackPhone ? { callbackPhone } : {}),
          ...(input.callerName ? { callerName: input.callerName } : {}),
          ...(input.urgency ? { urgency: input.urgency } : {}),
          ...(input.callbackWindow ? { callbackWindow: input.callbackWindow } : {}),
          ...(context.callId ? { callId: context.callId } : {}),
          ...(context.conversationId ? { conversationId: context.conversationId } : {}),
        });
      },
    }),
  };

  if (bookingMode === "instant") {
    tools.findAvailability = tool({
      description: "Find open appointment times for one service on one date. Never state availability without calling this.",
      inputSchema: z.object({
        serviceName: z.string().describe("One of the business's services."),
        date: z.string().describe("Date as YYYY-MM-DD in the business's timezone."),
        preferredTime: z.string().optional().describe("Preferred start time as HH:mm (24-hour)."),
      }),
      execute: async ({ serviceName, date, preferredTime }) => {
        const [hour, minute] = (preferredTime ?? "").split(":").map(Number);
        return await findOpenings(domain, {
          businessId,
          serviceName,
          date,
          timezone,
          hours: snapshot.hours,
          ...(Number.isFinite(hour) ? { preferredHour24: hour, preferredMinute: Number.isFinite(minute) ? minute : 0 } : {}),
          ...(context.callId ? { callId: context.callId } : {}),
        });
      },
    });
    tools.bookAppointment = tool({
      description: "Book an appointment at a time findAvailability returned, after the caller confirms the service and time. On phone calls, ask first whether you may text a confirmation and reminder, and pass their answer.",
      inputSchema: z.object({
        serviceName: z.string(),
        startsAt: z.string().describe("The exact startsAt value returned by findAvailability."),
        contactName: z.string().optional(),
        contactPhone: phone.optional().describe("Required when the caller's number isn't already known."),
        smsConsentGranted: z.boolean().describe("True only if the caller agreed to receive a confirmation and reminder text."),
      }),
      execute: async (input) => {
        const contactPhone = input.contactPhone ?? context.callerPhone;
        if (!contactPhone) return { ok: false, reason: "Ask for a phone number before booking." };
        const opening = await checkOpening(domain, { businessId, serviceName: input.serviceName, startsAt: input.startsAt, timezone, ...(context.callId ? { callId: context.callId } : {}) });
        if (!opening.ok || !opening.available) return { ok: false, reason: "That time is no longer available. Offer another opening." };
        return await bookForCaller(domain, {
          businessId,
          serviceName: input.serviceName,
          startsAt: input.startsAt,
          timezone,
          contactPhone,
          channel,
          smsConsentGranted: input.smsConsentGranted,
          ...(input.contactName ? { contactName: input.contactName } : {}),
          ...(context.callId ? { callId: context.callId } : {}),
        });
      },
    });
  }

  if (bookingMode === "request") {
    tools.requestAppointment = tool({
      description: "Pass an appointment request to the team, who will confirm the time with the caller. Collect the service, preferred day and time, name, and callback number first.",
      inputSchema: z.object({
        serviceName: z.string(),
        preferredTime: z.string().describe("The caller's preferred day and time, in their words."),
        callerName: z.string(),
        callbackPhone: phone.optional(),
        notes: z.string().optional(),
      }),
      execute: async (input) => {
        const callbackPhone = input.callbackPhone ?? context.callerPhone;
        if (!callbackPhone) return { ok: false, reason: "Ask for a callback number first." };
        const message = [`Appointment request: ${input.serviceName}`, `Preferred time: ${input.preferredTime}`, input.notes ? `Notes: ${input.notes}` : ""].filter(Boolean).join("\n");
        return await takeMessageForStaff(domain, {
          businessId,
          message,
          channel,
          callbackPhone,
          callerName: input.callerName,
          ...(context.callId ? { callId: context.callId } : {}),
          ...(context.conversationId ? { conversationId: context.conversationId } : {}),
        });
      },
    });
  }

  // Changing an appointment identifies the caller by their phone number, so it
  // is only offered when the call itself carries a trusted number.
  const changePolicy = normalizeAppointmentChangePolicy(snapshot.appointmentChangePolicy);
  const callerPhone = context.callerPhone;
  if (callerPhone && changePolicy.enabled && changePolicy.verificationMode !== "operator_only" && bookingMode !== "off") {
    tools.lookupAppointmentForChange = tool({
      description: "Check whether this caller's number has upcoming appointments before cancelling or rescheduling. It does not reveal appointment details.",
      inputSchema: z.object({}),
      execute: async () => await lookupCallerAppointments(domain, { businessId, callerPhone }),
    });
    tools.verifyAppointmentForChange = tool({
      description: "Verify the caller's name and one fact about their appointment (date/time or service) before any change.",
      inputSchema: z.object({
        action: z.enum(["cancel", "reschedule"]),
        callerName: z.string().optional(),
        appointmentStartsAt: z.string().optional().describe("The appointment time as the caller described it."),
        serviceName: z.string().optional(),
      }),
      execute: async (input) => await verifyCallerForChange(domain, {
        businessId,
        callerPhone,
        action: input.action,
        ...(input.callerName ? { callerName: input.callerName } : {}),
        ...(input.appointmentStartsAt ? { appointmentStartsAt: input.appointmentStartsAt } : {}),
        ...(input.serviceName ? { serviceName: input.serviceName } : {}),
      }),
    });
    tools.sendAppointmentChangeOtp = tool({
      description: "Text the caller a one-time code when verifyAppointmentForChange says a code is required.",
      inputSchema: z.object({ verificationId: z.string() }),
      execute: async ({ verificationId }) => await issueAppointmentChangeOtp(domain, { businessId, verificationId }),
    });
    tools.verifyAppointmentChangeOtp = tool({
      description: "Check the one-time code the caller reads back.",
      inputSchema: z.object({ verificationId: z.string(), code: z.string() }),
      execute: async ({ verificationId, code }) => await verifyAppointmentChangeOtp(domain, { businessId, verificationId, code }),
    });
    if (changePolicy.allowCancel) {
      tools.cancelAppointment = tool({
        description: "Cancel the verified appointment. Only after the caller explicitly confirms they want it cancelled now.",
        inputSchema: z.object({ appointmentId: z.string(), verificationId: z.string(), finalConfirmation: z.boolean() }),
        execute: async (input) => await cancelForCaller(domain, { businessId, callerPhone, ...input }),
      });
    }
    if (changePolicy.allowReschedule && bookingMode === "instant") {
      tools.rescheduleAppointment = tool({
        description: "Move the verified appointment to a new time that findAvailability returned. Only after the caller explicitly confirms the new time.",
        inputSchema: z.object({ appointmentId: z.string(), verificationId: z.string(), startsAt: z.string(), finalConfirmation: z.boolean() }),
        execute: async (input) => await rescheduleForCaller(domain, { businessId, callerPhone, ...input }),
      });
    }
  }

  const callControl = context.callControl;
  if (callControl) {
    tools.transferCall = tool({
      description: "Transfer the call to a person at the business when the transfer rules allow it and the caller asks for a person or has an urgent problem.",
      inputSchema: z.object({
        callerRequested: z.boolean().describe("True only if the caller explicitly asked for a person."),
        urgent: z.boolean().describe("True only if the caller described an urgent situation."),
        reason: z.string().optional(),
      }),
      execute: async (input) => {
        const destination = snapshot.transferPolicy.transferNumber;
        if (!destination || !isTransferPermitted(snapshot, input)) return { ok: false, reason: "Transfers aren't allowed right now. Offer to take a message." };
        await callControl.transfer(destination);
        return { ok: true, transferring: true };
      },
    });
    tools.endCall = tool({
      description: "Hang up after saying goodbye, when the caller is done, or when the call is spam or abusive.",
      inputSchema: z.object({ reason: z.enum(["caller_finished", "spam", "abuse"]) }),
      execute: async () => {
        await callControl.hangup();
        return { ok: true };
      },
    });
  }

  return tools;
}
