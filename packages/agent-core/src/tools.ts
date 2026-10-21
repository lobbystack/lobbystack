import {
  bookForCaller,
  cancelForCaller,
  countKnowledgeTokens,
  employeeDoesService,
  findOpenings,
  getSmsConsentOnFile,
  issueAppointmentChangeOtp,
  KNOWLEDGE_SEARCH_TOKEN_BUDGET,
  knowledgeQueryTerms,
  lookupCallerAppointments,
  requestCancellationForCaller,
  recordTextConsentForCaller,
  requestTeamForWidgetChat,
  rescheduleForCaller,
  resolveEmployee,
  searchKnowledgeEvidence,
  takeMessageForStaff,
  verifyCallerChangeCode,
  verifyCallerChangePasscode,
  verifyCallerForChange,
  type DomainContext,
  type SmsConsentOnFile,
  type UnavailableReason,
} from "@lobbystack/domain";
import { isBusinessOpen, isTransferPermitted, type BusinessContextSnapshot, type RuntimeLocale } from "@lobbystack/shared";
import { tool, type ToolSet } from "ai";
import { DateTime } from "luxon";
import { z } from "zod";

import { serviceFacts, upcomingClosures, weeklyHours } from "./businessFacts";
import { receptionistCapabilities, type ToolName } from "./capabilities";

/** Where the conversation happens. Phone calls know the caller's number. */
export type AgentChannel = "voice" | "web_voice" | "web_chat";

/**
 * What came of a PIN the caller typed on the keypad. "accepted" verifies the
 * change; "retry" means it didn't match and the caller can type it again;
 * "failed" means the change can't be verified on this call.
 */
export type KeypadPasscodeOutcome = {
  status: "accepted" | "retry" | "failed";
  /** Tries left on this call, when the caller can try again. */
  attemptsLeft?: number;
  /** Why the PIN wasn't accepted, as plain facts. */
  reason?: string;
  /** What the next request's agent sees, with the ids it needs to make the change. */
  result: object;
};

/** Checks the digits the caller typed. Only the call controller sees them. */
export type KeypadPasscodeCheck = (passcode: string) => Promise<KeypadPasscodeOutcome>;

/** Live-call controls the agent can use. Only phone calls provide them. */
export type CallControl = {
  /**
   * Phone calls only. Resolves true once the transfer is reserved: the call is
   * referred after the receptionist has announced it. Resolves false when the
   * transfer can't start, for example the plan is out of transfer attempts.
   */
  transfer?(destination: string): Promise<boolean>;
  hangup(reason: "caller_finished" | "spam" | "abuse"): Promise<void>;
  /**
   * Phone calls only. Starts taking a PIN on the keypad: the digits the caller
   * types next go to `check`, never to the transcript or the agent, and the
   * voice model hears the outcome. Resolves false when the call can't take
   * one, for example because it's ending.
   */
  collectPasscode?(check: KeypadPasscodeCheck): Promise<boolean>;
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
  /** Prospect demos only answer questions and take messages: no booking, no transfers. */
  intakeOnly?: boolean;
  /**
   * Website chats whose widget has live chat on: the visitor can ask for
   * someone from the team to join. `locale` is the chat's language, for what
   * the receptionist says if nobody joins in time. `onTeamRequested` hears
   * when the team was asked.
   */
  liveChat?: { locale: RuntimeLocale; onTeamRequested?: () => void };
};

// A plural always counts ("fee" finds "fees"). Other endings only count for terms of four
// or more letters and at most three extra letters ("park" finds "parking"), so "car"
// doesn't find "care".
function wordMatchesTerm(word: string, term: string): boolean {
  if (word === term || word === `${term}s` || word === `${term}es`) return true;
  return term.length >= 4 && word.startsWith(term) && word.length - term.length <= 3;
}

// Curated FAQs from the snapshot fill the slots knowledge search leaves, or stand in
// when it is unavailable. The document digest is an inventory, not evidence.
// Pasted snippets are long, so one shared word proves little. A snippet must contain a
// meaningful query term (see wordMatchesTerm), and two distinct terms once the query has
// three or more. More terms matched ranks first, then higher priority.
function snapshotKnowledgeMatches(snapshot: BusinessContextSnapshot, query: string) {
  const terms = knowledgeQueryTerms(query);
  if (!terms.length) return [];
  const needed = terms.length >= 3 ? 2 : 1;
  return (snapshot.knowledgeSnippets ?? []).flatMap((snippet) => {
    const words = `${snippet.title} ${snippet.content}`.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    const matched = terms.filter((term) => words.some((word) => wordMatchesTerm(word, term))).length;
    return matched >= needed ? [{ matched, priority: snippet.priority, title: snippet.title, text: snippet.content.trim() }] : [];
  }).sort((a, b) => b.matched - a.matched || b.priority - a.priority).map(({ title, text }) => ({ title, text }));
}

type KnowledgeMatch = { title: string; text: string };

// Evidence already fits the token budget, so it stays whole. Snippets get what it leaves,
// in rank order, so a long pasted snippet can't push a reply past the budget.
function withSnippetsInBudget(evidence: KnowledgeMatch[], snippets: KnowledgeMatch[]): KnowledgeMatch[] {
  let used = evidence.reduce((sum, match) => sum + countKnowledgeTokens(`${match.title}\n${match.text}\n`), 0);
  const fitting = snippets.filter((snippet) => {
    const size = countKnowledgeTokens(`${snippet.title}\n${snippet.text}\n`);
    if (used + size > KNOWLEDGE_SEARCH_TOKEN_BUDGET) return false;
    used += size;
    return true;
  });
  return [...evidence, ...fitting].slice(0, 6);
}

const phone = z.string().describe("Phone number in E.164 format, for example +14165550134.");

type NoOpeningsReason = UnavailableReason | "no_times_left";

const TAKE_REQUEST = "Offer to take a message with the caller's name, number and preferred time so the team can book it.";
const UNKNOWN_SERVICE = "Service is not available. Check the service name with getBusinessServices.";

/**
 * Why a time or a day can't be booked, in plain facts, then the next step.
 * Only "taken" means someone else has the time; the agent must not say a time
 * is booked for any other reason.
 */
export const UNAVAILABLE_TOOL_MESSAGES: Record<NoOpeningsReason, string> = {
  no_hours: `Appointments can't be booked automatically yet: the business hasn't set its opening hours. Don't offer times or say any time is taken. ${TAKE_REQUEST}`,
  closed_day: "The business is closed that day. Offer a day it's open; getBusinessHours lists the opening hours.",
  outside_hours: "That time is outside the business's opening hours. Offer a time inside them; getBusinessHours lists the opening hours.",
  closure: "The business is closed then for a planned closure. Offer another day.",
  no_staff: `No staff member takes bookings for this service, so it can't be booked automatically. ${TAKE_REQUEST}`,
  calendar_not_synced: `The business's calendar hasn't synced recently, so times can't be confirmed right now. Don't say the time is taken. ${TAKE_REQUEST}`,
  taken: "That time is already booked. Offer another opening.",
  no_times_left: "No start times are left that day. Offer another day.",
};

const DAY_UNAVAILABLE: Partial<Record<NoOpeningsReason, string>> = {
  // Only the first time was checked, so don't say the whole day is booked.
  taken: "No times are free that day. Offer another day.",
  outside_hours: "The service doesn't fit inside the opening hours that day. Offer another day.",
};

/** The entry of an employee's time off that covers a day (YYYY-MM-DD), if any. */
function timeOffOn(timeOff: Array<{ startsOn: string; endsOn: string }>, day: string) {
  return timeOff.find((entry) => entry.startsOn <= day && day <= entry.endsOn);
}

const isReason = (value: unknown): value is NoOpeningsReason => typeof value === "string" && value in UNAVAILABLE_TOOL_MESSAGES;

const OFFERINGS_QUERY = "What does the business do and offer: services, products and prices";

export function createReceptionistTools(context: AgentToolContext): ToolSet {
  const { domain, snapshot } = context;
  const businessId = snapshot.businessId;
  const timezone = snapshot.timezone;
  const channel = context.channel;
  // capabilities.ts decides which tools this conversation gets.
  const { tools: offeredTools, callerTextable } = receptionistCapabilities(snapshot, context);
  const offered = (name: ToolName) => offeredTools.includes(name);
  const withConsentOnFile = <T extends object>(result: T & { smsConsentOnFile?: SmsConsentOnFile }) => {
    const { smsConsentOnFile, ...rest } = result;
    return callerTextable && smsConsentOnFile ? { ...rest, smsConsentOnFile } : rest;
  };
  // Each delegation starts fresh, so the agent often books or moves to a time
  // it only saw in the conversation. Read a time without an offset in the
  // business's timezone; the server's own timezone would shift it.
  const startTime = (value: string) => {
    const start = DateTime.fromISO(value, { zone: timezone });
    if (!start.isValid) return { ok: false as const, reason: "Give startsAt as YYYY-MM-DDTHH:mm in the business's timezone." };
    if (start <= DateTime.now()) return { ok: false as const, reason: "That time has already passed. Offer a later time." };
    return { ok: true as const, startsAt: start.toISO()! };
  };
  async function searchKnowledge(query: string): Promise<{ outcome: string; matches: KnowledgeMatch[] }> {
    const fallback = snapshotKnowledgeMatches(snapshot, query);
    try {
      const evidence = await searchKnowledgeEvidence(domain, { businessId, query, limit: 6, ...(context.callId ? { callId: context.callId } : {}) });
      // Evidence first. Snippets only fill the slots and tokens it leaves.
      const matches = withSnippetsInBudget(evidence.matches.map((match) => ({ title: match.title, text: match.content })), fallback);
      return { outcome: matches.length ? "found" : evidence.outcome, matches };
    } catch {
      const matches = withSnippetsInBudget([], fallback);
      return { outcome: matches.length ? "found" : "unavailable", matches };
    }
  }

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
          weekly: weeklyHours(snapshot),
          // Local times with an offset, like `now` and `weekly`; the snapshot stores UTC.
          upcomingClosures: upcomingClosures(snapshot, now).map((closure) => ({
            ...closure,
            from: DateTime.fromISO(closure.from, { zone: timezone }).toISO()!,
            to: DateTime.fromISO(closure.to, { zone: timezone }).toISO()!,
          })),
        };
      },
    }),

    getBusinessServices: tool({
      description: "List the services the business offers, with duration and a short description. When the business lists none, it returns what the knowledge base says the business offers.",
      inputSchema: z.object({}),
      execute: async () => {
        const services = serviceFacts(snapshot);
        // Without a services list, "what do you offer" is answered from the
        // business's documents and website, in this same tool call.
        return services.length ? { services } : { services, knowledge: await searchKnowledge(OFFERINGS_QUERY) };
      },
    }),

    searchKnowledge: tool({
      description: "Look up any business-specific fact not in your instructions: prices, policies, parking, payment methods, what to bring, and so on. Never guess. Make the query self-contained.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => await searchKnowledge(query),
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
        const callbackPhone = input.callbackPhone?.trim() || context.callerPhone;
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

  if (offered("findAvailability")) {
    const employeeName = z.string().optional().describe("Only when the caller asked for a specific employee: that employee's name. Leave it out to book whoever is available first.");
    // The staff member a requested employee books under, or why they can't take this booking.
    const employeeFor = async (name: string | undefined, serviceName: string, day: string | undefined) => {
      if (!name?.trim()) return { ok: true as const };
      const match = await resolveEmployee(domain, { businessId, name });
      if (!match.ok) {
        return {
          ok: false as const,
          reason: match.employees.length
            ? `No single employee matches "${name}". The employees are: ${match.employees.join(", ")}. Ask the caller which one they mean.`
            : "This business doesn't book with specific employees. Leave employeeName out.",
        };
      }
      const off = day ? timeOffOn(match.timeOff, day) : undefined;
      if (off) {
        const back = DateTime.fromISO(off.endsOn).plus({ days: 1 }).toFormat("cccc, LLLL d");
        return {
          ok: false as const,
          reason: `${match.name} is off from ${DateTime.fromISO(off.startsOn).toFormat("cccc, LLLL d")} to ${DateTime.fromISO(off.endsOn).toFormat("cccc, LLLL d")}, so they can't be booked that day. Tell the caller, then offer ${match.name} from ${back} on, or another employee or whoever is available first on the day they wanted.`,
        };
      }
      const check = await employeeDoesService(domain, { businessId, staffId: match.staffId, serviceName });
      if (!check.does) {
        const offers = match.services.length ? `${match.name} does: ${match.services.join(", ")}.` : `${match.name} takes no bookings right now.`;
        return {
          ok: false as const,
          reason: `${match.name} doesn't do ${check.serviceName}, so it can't be booked with them. ${offers} Tell the caller, then offer ${check.serviceName} with an employee who does it or whoever is available first${match.services.length ? `, or one of ${match.name}'s services` : ""}.`,
        };
      }
      return { ok: true as const, staffId: match.staffId, employeeName: match.name };
    };
    tools.findAvailability = tool({
      description: "Find open appointment times for one service on one date. Never state availability without calling this. Don't use it to recheck a time the caller already accepted; bookAppointment checks that.",
      inputSchema: z.object({
        serviceName: z.string().describe("One of the business's services."),
        date: z.string().describe("Date as YYYY-MM-DD in the business's timezone."),
        preferredTime: z.string().optional().describe("Preferred start time as HH:mm (24-hour)."),
        employeeName,
      }),
      execute: async ({ serviceName, date, preferredTime, employeeName: requested }) => {
        const employee = await employeeFor(requested, serviceName, date);
        if (!employee.ok) return employee;
        const [hour, minute] = (preferredTime ?? "").split(":").map(Number);
        const callerPhone = callerTextable ? context.callerPhone : undefined;
        const [result, smsConsentOnFile] = await Promise.all([
          findOpenings(domain, {
            businessId,
            serviceName,
            date,
            ...(Number.isFinite(hour) ? { preferredHour24: hour, preferredMinute: Number.isFinite(minute) ? minute : 0 } : {}),
            ...(context.callId ? { callId: context.callId } : {}),
            ...(employee.staffId ? { staffId: employee.staffId } : {}),
          }),
          // The caller's answer on file, so the agent asks about texts only once.
          callerPhone ? getSmsConsentOnFile(domain, { businessId, phone: callerPhone }).catch(() => undefined) : undefined,
        ]);
        if (!result.ok) return { ok: false, reason: UNKNOWN_SERVICE };
        const withEmployee = employee.employeeName ? { ...result, employeeName: employee.employeeName } : result;
        const answer = smsConsentOnFile ? { ...withEmployee, smsConsentOnFile } : withEmployee;
        // An empty day says why, so the agent doesn't call it fully booked when it isn't.
        if (answer.openings.length || !answer.reason) return answer;
        return { ...answer, reason: DAY_UNAVAILABLE[answer.reason] ?? UNAVAILABLE_TOOL_MESSAGES[answer.reason] };
      },
    });
    tools.bookAppointment = tool({
      description: "Book an appointment once the caller accepts a time you offered. It checks the time is still open, so don't call findAvailability again first.",
      inputSchema: z.object({
        serviceName: z.string(),
        startsAt: z.string().describe("A startsAt value from findAvailability, or the accepted time as YYYY-MM-DDTHH:mm in the business's timezone."),
        contactName: z.string().optional().describe("The caller's name. Required to book."),
        contactPhone: phone.optional().describe("Required when the caller's number isn't already known."),
        employeeName,
      }),
      execute: async (input) => {
        const contactPhone = input.contactPhone?.trim() || context.callerPhone;
        const contactName = input.contactName?.trim();
        if (!contactName) return { ok: false, reason: "Ask for the caller's name before booking." };
        if (!contactPhone) return { ok: false, reason: "Ask for a phone number before booking." };
        const employee = await employeeFor(input.employeeName, input.serviceName, DateTime.fromISO(input.startsAt, { zone: timezone }).toISODate() ?? undefined);
        if (!employee.ok) return employee;
        const start = startTime(input.startsAt);
        if (!start.ok) return start;
        // A repeated request returns the booking it already made, found only
        // by the call's own number or the call itself.
        let booked: Awaited<ReturnType<typeof bookForCaller>>;
        try {
          booked = await bookForCaller(domain, {
            businessId,
            service: { name: input.serviceName },
            startsAt: start.startsAt,
            timezone,
            contactPhone,
            contactName,
            channel,
            ...(context.callerPhone ? { callerPhone: context.callerPhone } : {}),
            ...(context.callId ? { callId: context.callId } : {}),
            ...(employee.staffId ? { preferredStaffId: employee.staffId } : {}),
          });
        } catch {
          return { ok: false, reason: "The booking could not be completed." };
        }
        if (!booked.ok) return { ok: false, reason: booked.reason === "unknown_service" ? UNKNOWN_SERVICE : UNAVAILABLE_TOOL_MESSAGES[booked.reason] };
        // An answer about texts on this call covers only the number calling.
        return callerTextable && contactPhone !== context.callerPhone
          ? { ...booked, textConfirmation: "This booking is under another number than the one calling. The caller's answer about texts doesn't cover it, so don't say texts will come for it." }
          : booked;
      },
    });
  }

  // Its own tool, so the answer counts whenever the caller gives it: GPT-Live
  // often asks about texts only after the booking or cancellation is done.
  const callId = context.callId;
  if (offered("recordTextPreference") && callId) {
    tools.recordTextPreference = tool({
      description: "Save the caller's answer as soon as they say whether they want texts about their appointments, before or after booking or cancelling. A yes to a time or to booking isn't a yes to texts.",
      inputSchema: z.object({ answer: z.enum(["agreed", "declined"]) }),
      execute: async ({ answer }) => {
        const onFile = await recordTextConsentForCaller(domain, { businessId, callId, callerPhone: context.callerPhone!, answer });
        if (!onFile) return { ok: false, reason: "The answer could not be saved." };
        const result = onFile === "subscribed" ? "Saved: the number calling will get texts about appointments booked under it." : onFile === "declined" ? "Saved: the number calling won't get texts about its appointments." : "This number opted out of texts, so it won't get any.";
        return { ok: true, smsConsentOnFile: onFile, result };
      },
    });
  }

  if (offered("requestAppointment")) {
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
        const callbackPhone = input.callbackPhone?.trim() || context.callerPhone;
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

  // Changing an appointment identifies the caller by the call's own number.
  const callerPhone = context.callerPhone;
  if (offered("lookupAppointmentForChange") && callerPhone) {
    tools.lookupAppointmentForChange = tool({
      description: "Check whether this caller's number has upcoming appointments before cancelling or rescheduling. It does not reveal appointment details.",
      inputSchema: z.object({}),
      execute: async () => await lookupCallerAppointments(domain, { businessId, callerPhone }),
    });
    tools.verifyAppointmentForChange = tool({
      description: "Verify the appointment before any change, with one fact the caller gives: its date and time, or its service. The call's number already identifies the caller, so their name isn't needed.",
      inputSchema: z.object({
        action: z.enum(["cancel", "reschedule"]),
        appointmentStartsAt: z.string().optional().describe("The appointment time as the caller described it."),
        serviceName: z.string().optional(),
      }),
      execute: async (input) => withConsentOnFile(await verifyCallerForChange(domain, {
        businessId,
        callerPhone,
        // An accepted keypad PIN counts only on this call.
        ...(context.callId ? { callId: context.callId } : {}),
        action: input.action,
        ...(input.appointmentStartsAt ? { appointmentStartsAt: input.appointmentStartsAt } : {}),
        ...(input.serviceName ? { serviceName: input.serviceName } : {}),
      })),
    });
    const collectPasscode = context.callControl?.collectPasscode?.bind(context.callControl);
    if (offered("requestKeypadPasscode") && collectPasscode) {
      // The caller types the PIN on the keypad, which only the call controller
      // hears, so the PIN never reaches the agent, the voice model or the transcript.
      tools.requestKeypadPasscode = tool({
        description: "Start the keypad PIN check when verifyAppointmentForChange says a PIN is required. The caller types their PIN on the phone keypad; you never see it, and the result comes in a later request.",
        inputSchema: z.object({ verificationId: z.string() }),
        execute: async ({ verificationId }) => {
          const started = await collectPasscode(async (passcode) => {
            const result = withConsentOnFile(await verifyCallerChangePasscode(domain, { businessId, verificationId, passcode }));
            const status = result.ok ? "accepted" : result.status === "passcode_pending" ? "retry" : "failed";
            return { status, result, ...(result.attemptsLeft !== undefined ? { attemptsLeft: result.attemptsLeft } : {}), ...(result.reason ? { reason: result.reason } : {}) };
          });
          return started ? { ok: true, waitingForKeypad: true } : { ok: false, reason: "The call can't take a PIN right now, so the change can't be verified." };
        },
      });
    }
    if (offered("sendAppointmentChangeOtp")) {
      tools.sendAppointmentChangeOtp = tool({
        description: "Text the caller a one-time code when verifyAppointmentForChange says a code is required.",
        inputSchema: z.object({ verificationId: z.string() }),
        execute: async ({ verificationId }) => await issueAppointmentChangeOtp(domain, { businessId, verificationId }),
      });
      tools.verifyAppointmentChangeOtp = tool({
        description: "Check the one-time code the caller reads back.",
        inputSchema: z.object({ verificationId: z.string(), code: z.string() }),
        execute: async ({ verificationId, code }) => withConsentOnFile(await verifyCallerChangeCode(domain, { businessId, verificationId, code })),
      });
    }
    if (offered("cancelAppointment")) {
      tools.cancelAppointment = tool({
        description: "Cancel the verified appointment. Only after the caller explicitly confirms they want it cancelled now.",
        inputSchema: z.object({
          appointmentId: z.string(),
          verificationId: z.string(),
          finalConfirmation: z.boolean(),
        }),
        execute: async (input) => {
          const result = withConsentOnFile(await cancelForCaller(domain, { businessId, callerPhone, ...input, ...(context.callId ? { callId: context.callId } : {}) }));
          return "smsConsentOnFile" in result && result.smsConsentOnFile === "subscribed" ? { ...result, textConfirmation: "The caller will get a text confirming the cancellation." } : result;
        },
      });
    }
    if (offered("rescheduleAppointment")) {
      tools.rescheduleAppointment = tool({
        description: "Move the verified appointment to a new time that findAvailability returned. Only after the caller explicitly confirms the new time.",
        inputSchema: z.object({ appointmentId: z.string(), verificationId: z.string(), startsAt: z.string(), finalConfirmation: z.boolean() }),
        execute: async (input) => {
          const start = startTime(input.startsAt);
          if (!start.ok) return start;
          const result = await rescheduleForCaller(domain, { businessId, callerPhone, ...input, startsAt: start.startsAt });
          return !result.ok && "unavailableReason" in result && isReason(result.unavailableReason) ? { ok: false, reason: UNAVAILABLE_TOOL_MESSAGES[result.unavailableReason] } : result;
        },
      });
    }
  }

  if (offered("requestAppointmentCancellation")) {
    tools.requestAppointmentCancellation = tool({
      description: "Pass the caller's request to cancel an appointment to the team, when you can't cancel it yourself. It doesn't cancel anything: the team does. Get the caller's name and what they know of the appointment (date, time, service) first.",
      inputSchema: z.object({
        callerName: z.string().describe("The name the appointment was booked under."),
        appointmentStartsAt: z.string().optional().describe("The appointment's date as YYYY-MM-DD, or date and time as YYYY-MM-DDTHH:mm, in the business's timezone."),
        serviceName: z.string().optional(),
        callbackPhone: phone.optional().describe("The number the appointment was booked with, if the caller gives it."),
        notes: z.string().optional(),
      }),
      execute: async (input) => {
        if (!input.callerName.trim()) return { ok: false, reason: "Ask for the name the appointment was booked under." };
        const callbackPhone = input.callbackPhone?.trim() || context.callerPhone;
        const saved = await requestCancellationForCaller(domain, {
          businessId,
          channel,
          timezone,
          callerName: input.callerName,
          ...(input.appointmentStartsAt ? { appointmentStartsAt: input.appointmentStartsAt } : {}),
          ...(input.serviceName ? { serviceName: input.serviceName } : {}),
          ...(input.notes ? { notes: input.notes } : {}),
          ...(callbackPhone ? { callbackPhone } : {}),
          ...(context.callId ? { callId: context.callId } : {}),
          ...(context.conversationId ? { conversationId: context.conversationId } : {}),
        });
        return { ...saved, cancelled: false, status: "The request is saved for the team. The appointment is still booked until the team cancels it." };
      },
    });
  }

  // A website chat with live chat on brings a person into the chat instead of transferring.
  const liveChat = context.liveChat;
  const conversationId = context.conversationId;
  if (offered("requestTeamMember") && liveChat && conversationId) {
    tools.requestTeamMember = tool({
      description: "Ask someone from the team to join this chat, when the visitor asks for a person or a rule says to transfer them. The team gets an alert and replies in this chat. Only works during opening hours, or at any time when the business has set none.",
      inputSchema: z.object({ reason: z.string().optional().describe("What the visitor needs, in a few words, for the team's alert.") }),
      execute: async ({ reason }) => {
        if (snapshot.hours.length && !isBusinessOpen(snapshot)) return { ok: false, reason: "It's outside opening hours, so nobody from the team can join the chat now." };
        const outcome = await requestTeamForWidgetChat(domain, { businessId, conversationId, locale: liveChat.locale, ...(reason?.trim() ? { reason } : {}) });
        if (outcome.ok) {
          liveChat.onTeamRequested?.();
          return { ok: true, status: `The team was alerted. Someone should join this chat within ${outcome.waitMinutes} minutes. If nobody does, the chat comes back to you and the visitor is asked for a name and number for a callback.` };
        }
        return outcome.reason === "team_has_chat"
          ? { ok: false, reason: "The team already has this chat, or was already asked to join it." }
          : { ok: false, reason: "The team couldn't be asked to join this chat." };
      },
    });
  }

  const callControl = context.callControl;
  const transfer = callControl?.transfer?.bind(callControl);
  if (offered("transferCall") && transfer) {
    tools.transferCall = tool({
      description: "Transfer the call to a person at the business when the transfer rules allow it and the caller asks for a person or has an urgent problem.",
      inputSchema: z.object({
        callerRequested: z.boolean().describe("True only if the caller explicitly asked for a person."),
        urgent: z.boolean().describe("True only if the caller described an urgent situation."),
        reason: z.string().optional(),
        employeeName: z.string().optional().describe("Only when the caller asked for a specific employee: that employee's name."),
      }),
      execute: async (input) => {
        const businessNumber = snapshot.transferPolicy.transferNumber;
        // The business's transfer rules decide whether anyone can be reached, an employee included.
        if (!businessNumber || !isTransferPermitted(snapshot, input)) return { ok: false, reason: "Transfers aren't allowed right now. Offer to take a message." };
        let destination = businessNumber;
        let employeeName: string | undefined;
        if (input.employeeName?.trim()) {
          const match = await resolveEmployee(domain, { businessId, name: input.employeeName });
          if (!match.ok) {
            return {
              ok: false,
              reason: match.employees.length
                ? `No single employee matches "${input.employeeName}". The employees are: ${match.employees.join(", ")}. Ask the caller which one they mean.`
                : "This business has no employees to transfer to by name. Leave employeeName out to reach the business.",
            };
          }
          const off = timeOffOn(match.timeOff, DateTime.now().setZone(snapshot.timezone).toISODate()!);
          if (off) {
            return { ok: false, reason: `${match.name} is off until ${DateTime.fromISO(off.endsOn).toFormat("cccc, LLLL d")}. Tell the caller, and offer to take a message for them or to connect the caller to the business instead.` };
          }
          // An employee without a number of their own, or during a free trial (resolveEmployee leaves it out), is reached through the business.
          destination = match.phone ?? businessNumber;
          employeeName = match.name;
        }
        const started = await transfer(destination);
        if (!started) return { ok: false, reason: "The transfer couldn't be started. Offer to take a message." };
        return employeeName ? { ok: true, transferring: true, employeeName } : { ok: true, transferring: true };
      },
    });
  }
  if (offered("endCall") && callControl) {
    tools.endCall = tool({
      description: "End the call. Use the reason caller_finished when the caller is done or is saying goodbye: the voice model says goodbye when it hears the call is ending, so don't write a reply. Use spam or abuse for a spam or abusive call.",
      inputSchema: z.object({ reason: z.enum(["caller_finished", "spam", "abuse"]) }),
      execute: async ({ reason }) => {
        await callControl.hangup(reason);
        return { ok: true };
      },
    });
  }

  return tools;
}
