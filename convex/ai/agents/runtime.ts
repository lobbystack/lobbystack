import { createThread } from "@convex-dev/agent";
import { DateTime } from "luxon";
import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { receptionistAgent } from "../../lib/components";

function buildGroundedPrompt(input: {
  smsInstructions: string;
  summary: string;
  bookingPolicy: string;
  knowledgeDigest: string;
  hoursCount: number;
  timezone: string;
  businessNowLabel: string;
  services: Array<{ name: string; durationMinutes: number }>;
  knowledge: Array<{ text: string }>;
  prompt: string;
}): string {
  return [
    `SMS instructions: ${input.smsInstructions}`,
    `Business summary: ${input.summary}`,
    `Booking policy: ${input.bookingPolicy}`,
    `Business timezone: ${input.timezone}`,
    `Current local business time: ${input.businessNowLabel}`,
    `Available services: ${input.services
      .map((service) => `${service.name} (${service.durationMinutes} min)`)
      .join(", ") || "No services configured."}`,
    `Knowledge digest: ${input.knowledgeDigest || "No long-form knowledge configured."}`,
    `Business hours count: ${input.hoursCount}`,
    "This is an SMS conversation, not a live phone call.",
    "Do not say things like 'one moment, please' or claim you are checking something unless the answer you send already includes the result.",
    "Interpret relative dates and times using the business timezone.",
    `Relevant knowledge:\n${input.knowledge.map((entry) => entry.text).join("\n---\n")}`,
    `User message: ${input.prompt}`,
  ].join("\n\n");
}

type RecentConversationMessage = Pick<Doc<"messages">, "direction" | "body" | "_creationTime">;
type ConversationBookingStateRecord = Doc<"conversation_booking_state">;
type SmsTimePreference = {
  hour24: number;
  minute: number;
  approximate: boolean;
  label: string;
};
type SmsDatePreference = {
  isoDate: string;
  dayStart: DateTime;
  label: string;
};
type ConversationSmsContact = {
  contactPhone: string;
  contactName?: string;
};

const WEEKDAY_INDEX_BY_NAME: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

function normalizeComparable(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function tokenizeComparable(value: string): Array<string> {
  return normalizeComparable(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function scoreServiceMatch(
  service: Pick<Doc<"services">, "name" | "slug">,
  serviceName: string,
): number {
  const comparable = normalizeComparable(serviceName);
  const nameComparable = normalizeComparable(service.name);
  const slugComparable = normalizeComparable(service.slug);

  if (nameComparable === comparable || slugComparable === comparable) {
    return 100;
  }

  if (nameComparable.includes(comparable) || comparable.includes(nameComparable)) {
    return 80;
  }

  if (slugComparable.includes(comparable) || comparable.includes(slugComparable)) {
    return 75;
  }

  const queryTokens = tokenizeComparable(serviceName);
  const serviceTokens = new Set([
    ...tokenizeComparable(service.name),
    ...tokenizeComparable(service.slug),
  ]);
  const overlap = queryTokens.filter((token) => serviceTokens.has(token)).length;
  if (overlap > 0) {
    return overlap * 10;
  }

  return 0;
}

function buildBusinessNowLabel(timezone: string): string {
  return DateTime.now().setZone(timezone).toFormat("cccc, LLL d, yyyy 'at' h:mm a");
}

function formatRequestedDateLabel(dayStart: DateTime): string {
  return dayStart.toFormat("cccc, LLL d");
}

function toSmsDatePreference(dayStart: DateTime): SmsDatePreference {
  return {
    isoDate: dayStart.toISODate() ?? dayStart.toFormat("yyyy-MM-dd"),
    dayStart,
    label: formatRequestedDateLabel(dayStart),
  };
}

function buildServiceSelectionReply(services: Array<Pick<Doc<"services">, "name">>): string {
  return `Which service would you like to book? Available services: ${services
    .map((service) => service.name)
    .join(", ")}.`;
}

function buildSetupIssueReply(serviceName: string, setupIssue: "no_active_staff" | "no_staff_assigned"): string {
  return setupIssue === "no_active_staff"
    ? `${serviceName} cannot be booked yet because no active team members are configured for booking.`
    : `${serviceName} cannot be booked yet because no active team member is assigned to that service.`;
}

function looksLikeSchedulingRequest(text: string): boolean {
  return /\b(appointment|book|booking|schedule|availability|available|slot|room)\b/i.test(text);
}

function looksLikeAlternativeTimesRequest(text: string): boolean {
  return /\b(any other times|other times|another time|another slot|anything else|later that day|earlier that day)\b/i.test(
    text,
  );
}

function looksLikeBookingConfirmation(text: string): boolean {
  return /\b(yes|yeah|yep|sure|book it|please book|that works|works for me|let's do|confirm|good|sounds good|perfect|ok(?:ay)?)\b/i.test(
    text,
  );
}

function isTimeOnlyReply(text: string): boolean {
  const normalized = text.trim().replace(/[?.!,]+$/g, "");
  return (
    /^(?:at\s*)?\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)$/i.test(normalized) ||
    /^(?:at\s*)?(?:[01]?\d|2[0-3]):[0-5]\d$/i.test(normalized) ||
    /^(morning|afternoon|evening|noon)$/i.test(normalized)
  );
}

function looksLikeSchedulingFollowUp(text: string): boolean {
  return (
    /\b(today|tomorrow|morning|afternoon|evening|noon|next week|this week)\b/i.test(text) ||
    /\b(?:(next|this)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
      text,
    ) ||
    /\b(?:what about|how about)\b/i.test(text) ||
    /\bon\s+(?:the\s+)?\d{1,2}(?:st|nd|rd|th)?\b/i.test(text) ||
    /\bthe\s+\d{1,2}(?:st|nd|rd|th)?\b/i.test(text) ||
    /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i.test(text) ||
    /\b\d{4}-\d{1,2}-\d{1,2}\b/.test(text) ||
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(text) ||
    looksLikeAlternativeTimesRequest(text) ||
    looksLikeBookingConfirmation(text)
  );
}

function resolveServiceFromState(
  services: Array<Doc<"services">>,
  state: ConversationBookingStateRecord | null,
): Doc<"services"> | null {
  if (!state?.selectedServiceId) {
    return null;
  }

  return services.find((service) => service._id === state.selectedServiceId) ?? null;
}

function resolveRequestedDate(
  text: string,
  timezone: string,
  referenceIsoDate?: string,
): SmsDatePreference | null {
  const localNow = DateTime.now().setZone(timezone);
  const referenceDay =
    referenceIsoDate === undefined
      ? null
      : DateTime.fromISO(referenceIsoDate, { zone: timezone }).startOf("day");
  const baseDay =
    referenceDay && referenceDay.isValid
      ? referenceDay
      : localNow.startOf("day");

  if (/\bday after tomorrow\b/i.test(text)) {
    return toSmsDatePreference(localNow.plus({ days: 2 }).startOf("day"));
  }

  if (/\btomorrow\b/i.test(text)) {
    return toSmsDatePreference(localNow.plus({ days: 1 }).startOf("day"));
  }

  if (/\btoday\b/i.test(text)) {
    return toSmsDatePreference(localNow.startOf("day"));
  }

  const weekdayMatch = text.match(
    /\b(?:(next|this)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  );
  if (weekdayMatch) {
    const modifier = weekdayMatch[1]?.toLowerCase() ?? null;
    const weekdayName = weekdayMatch[2]?.toLowerCase();
    const targetWeekday = weekdayName ? WEEKDAY_INDEX_BY_NAME[weekdayName] : undefined;
    if (targetWeekday !== undefined) {
      const currentWeekday = localNow.weekday;
      let daysAhead = (targetWeekday - currentWeekday + 7) % 7;
      if (modifier === "this") {
        daysAhead = daysAhead === 0 ? 0 : daysAhead;
      } else if (daysAhead === 0) {
        daysAhead = 7;
      }

      return toSmsDatePreference(localNow.plus({ days: daysAhead }).startOf("day"));
    }
  }

  const bareDayMatch =
    text.match(/\bon\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\b/i) ??
    text.match(/\bthe\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (bareDayMatch?.[1]) {
    const day = Number(bareDayMatch[1]);
    if (day >= 1 && day <= 31) {
      let candidate = DateTime.fromObject(
        { year: baseDay.year, month: baseDay.month, day },
        { zone: timezone },
      ).startOf("day");
      if (!candidate.isValid) {
        candidate = DateTime.fromObject(
          { year: baseDay.plus({ months: 1 }).year, month: baseDay.plus({ months: 1 }).month, day },
          { zone: timezone },
        ).startOf("day");
      } else if (candidate < baseDay) {
        const nextMonth = baseDay.plus({ months: 1 });
        candidate = DateTime.fromObject(
          { year: nextMonth.year, month: nextMonth.month, day },
          { zone: timezone },
        ).startOf("day");
      }

      if (candidate.isValid) {
        return toSmsDatePreference(candidate);
      }
    }
  }

  const isoDateMatch = text.match(/\b(\d{4}-\d{1,2}-\d{1,2})\b/);
  if (isoDateMatch?.[1]) {
    const dayStart = DateTime.fromISO(isoDateMatch[1], { zone: timezone }).startOf("day");
    if (dayStart.isValid) {
      return toSmsDatePreference(dayStart);
    }
  }

  const slashDateMatch = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slashDateMatch) {
    const [, monthText, dayText, yearText] = slashDateMatch;
    const month = Number(monthText);
    const day = Number(dayText);
    const year =
      yearText === undefined
        ? localNow.year
        : yearText.length === 2
          ? 2000 + Number(yearText)
          : Number(yearText);
    const dayStart = DateTime.fromObject({ year, month, day }, { zone: timezone }).startOf("day");
    if (dayStart.isValid) {
      return toSmsDatePreference(dayStart);
    }
  }

  const monthNameMatch = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,?\s*(\d{4}))?\b/i,
  );
  if (monthNameMatch) {
    const [, monthName, dayText, yearText] = monthNameMatch;
    const format = yearText ? "LLLL d yyyy" : "LLLL d yyyy";
    const value = `${monthName} ${dayText} ${yearText ?? localNow.year}`;
    const dayStart = DateTime.fromFormat(value, format, { zone: timezone }).startOf("day");
    if (dayStart.isValid) {
      return toSmsDatePreference(dayStart);
    }
  }

  return null;
}

function resolveRequestedTime(text: string): SmsTimePreference | null {
  const meridiemMatch = text.match(/\b(?:at\s*)?(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (meridiemMatch) {
    const [, hourText, minuteText, meridiem] = meridiemMatch;
    if (!meridiem) {
      return null;
    }
    const rawHour = Number(hourText);
    const minute = minuteText ? Number(minuteText) : 0;
    const normalizedMeridiem = meridiem.toLowerCase();
    const hour24 =
      normalizedMeridiem.startsWith("p")
        ? rawHour === 12
          ? 12
          : rawHour + 12
        : rawHour === 12
          ? 0
          : rawHour;

    return {
      hour24,
      minute,
      approximate: false,
      label: DateTime.fromObject({ hour: hour24, minute }).toFormat("h:mm a"),
    };
  }

  const twentyFourHourMatch = text.match(/\b(?:at\s*)?([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twentyFourHourMatch) {
    const [, hourText, minuteText] = twentyFourHourMatch;
    const hour24 = Number(hourText);
    const minute = Number(minuteText);
    return {
      hour24,
      minute,
      approximate: false,
      label: DateTime.fromObject({ hour: hour24, minute }).toFormat("h:mm a"),
    };
  }

  if (/\bmorning\b/i.test(text)) {
    return { hour24: 10, minute: 0, approximate: true, label: "morning" };
  }
  if (/\bafternoon\b/i.test(text)) {
    return { hour24: 14, minute: 0, approximate: true, label: "afternoon" };
  }
  if (/\bevening\b/i.test(text)) {
    return { hour24: 18, minute: 0, approximate: true, label: "evening" };
  }
  if (/\bnoon\b/i.test(text)) {
    return { hour24: 12, minute: 0, approximate: true, label: "noon" };
  }

  return null;
}

function getRequestedDateFromState(
  state: ConversationBookingStateRecord | null,
  timezone: string,
): SmsDatePreference | null {
  if (!state?.requestedDate) {
    return null;
  }

  const dayStart = DateTime.fromISO(state.requestedDate, { zone: timezone }).startOf("day");
  return dayStart.isValid ? toSmsDatePreference(dayStart) : null;
}

function getRequestedTimeFromState(
  state: ConversationBookingStateRecord | null,
): SmsTimePreference | null {
  if (state?.preferredHour24 === undefined) {
    return null;
  }

  const minute = state.preferredMinute ?? 0;
  return {
    hour24: state.preferredHour24,
    minute,
    approximate: false,
    label: DateTime.fromObject({ hour: state.preferredHour24, minute }).toFormat("h:mm a"),
  };
}

function shouldReuseStoredDate(
  text: string,
  state: ConversationBookingStateRecord | null,
): boolean {
  if (!state?.requestedDate) {
    return false;
  }

  return looksLikeAlternativeTimesRequest(text) || isTimeOnlyReply(text) || looksLikeBookingConfirmation(text);
}

function findMatchingOfferedSlot(
  state: ConversationBookingStateRecord | null,
  timezone: string,
  requestedDate: SmsDatePreference,
  requestedTime: SmsTimePreference,
): string | null {
  if (!state?.lastOfferedStartsAt || state.lastOfferedStartsAt.length === 0) {
    return null;
  }

  for (const startsAt of state.lastOfferedStartsAt) {
    const localStart = DateTime.fromISO(startsAt, { setZone: true }).setZone(timezone);
    if (
      localStart.isValid &&
      localStart.toISODate() === requestedDate.isoDate &&
      localStart.hour === requestedTime.hour24 &&
      localStart.minute === requestedTime.minute
    ) {
      return startsAt;
    }
  }

  return null;
}

async function getRelevantSchedulingText(
  ctx: ActionCtx,
  conversationId: Id<"conversations">,
  prompt: string,
  state: ConversationBookingStateRecord | null,
  services: Array<Doc<"services">>,
): Promise<string | null> {
  if (looksLikeSchedulingRequest(prompt)) {
    return prompt;
  }

  const hasState = state !== null;
  const serviceMention = services.some((service) => scoreServiceMatch(service, prompt) > 0);
  if (serviceMention && looksLikeSchedulingFollowUp(prompt)) {
    return prompt;
  }
  if (hasState && (looksLikeSchedulingFollowUp(prompt) || serviceMention)) {
    return prompt;
  }

  if (!looksLikeSchedulingFollowUp(prompt) && !serviceMention) {
    return null;
  }

  const recentMessages: Array<RecentConversationMessage> = await ctx.runQuery(
    internal.ai.agents.runtime.getRecentConversationMessages,
    {
      conversationId,
      limit: 6,
    },
  );
  const inboundMessages = recentMessages.filter((message) => message.direction === "inbound");
  const previousInbound =
    inboundMessages.length >= 2
      ? inboundMessages[inboundMessages.length - 2]?.body
      : undefined;
  if (!previousInbound || !looksLikeSchedulingRequest(previousInbound)) {
    return null;
  }

  return `${previousInbound}\n${prompt}`;
}

function resolveRequestedService(
  services: Array<Doc<"services">>,
  schedulingText: string,
  state: ConversationBookingStateRecord | null,
): Doc<"services"> | null {
  const ranked = services
    .map((service) => ({
      service,
      score: scoreServiceMatch(service, schedulingText),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  const topCandidate = ranked[0];
  const runnerUp = ranked[1];
  if (topCandidate && runnerUp && topCandidate.score === runnerUp.score) {
    return resolveServiceFromState(services, state);
  }

  if (topCandidate) {
    return topCandidate.service;
  }

  const fromState = resolveServiceFromState(services, state);
  if (fromState) {
    return fromState;
  }

  if (services.length === 1) {
    return services[0] ?? null;
  }

  return null;
}

function buildAvailabilityReply(input: {
  serviceName: string;
  dateLabel: string;
  requestedTime?: SmsTimePreference | null;
  slots: Array<{ displayTime: string }>;
}): string {
  if (input.slots.length === 0) {
    return input.requestedTime
      ? `I do not have ${input.serviceName} available on ${input.dateLabel} around ${input.requestedTime.label}.`
      : `I do not have any ${input.serviceName} availability on ${input.dateLabel}.`;
  }

  const slotSummary = input.slots.map((slot) => slot.displayTime).join(", ");
  if (input.requestedTime) {
    return `I do not have ${input.serviceName} available on ${input.dateLabel} at ${input.requestedTime.label}. The closest available times are ${slotSummary}. Would any of those work for you?`;
  }

  return `The next available ${input.serviceName} times on ${input.dateLabel} are ${slotSummary}. What time would you prefer?`;
}

function buildPendingBookingReply(
  serviceName: string,
  startsAt: string,
  timezone: string,
): string {
  const localStart = DateTime.fromISO(startsAt, { setZone: true }).setZone(timezone);
  const formatted = localStart.isValid
    ? localStart.toFormat("cccc, LLL d 'at' h:mm a")
    : startsAt;
  return `I have ${serviceName} available for ${formatted}. Does that work for you?`;
}

function buildBookedAppointmentReply(
  serviceName: string,
  startsAt: string,
  timezone: string,
): string {
  const localStart = DateTime.fromISO(startsAt, { setZone: true }).setZone(timezone);
  const formatted = localStart.isValid
    ? localStart.toFormat("cccc, LLL d 'at' h:mm a")
    : startsAt;
  return `Great, I booked your ${serviceName} for ${formatted}.`;
}

async function bookConversationAppointment(
  ctx: ActionCtx,
  input: {
    businessId: Id<"businesses">;
    conversationId: Id<"conversations">;
    service: Doc<"services">;
    startsAt: string;
    timezone: string;
  },
): Promise<string> {
  const contact: ConversationSmsContact | null = await ctx.runQuery(
    internal.ai.agents.runtime.getConversationSmsContact,
    { conversationId: input.conversationId },
  );
  if (!contact) {
    throw new Error("SMS conversation is missing a contact for booking.");
  }

  await ctx.runMutation(internal.appointments.booking.bookAppointmentForBusiness, {
    businessId: input.businessId,
    serviceId: input.service._id,
    startsAt: input.startsAt,
    timezone: input.timezone,
    contactPhone: contact.contactPhone,
    ...(contact.contactName !== undefined ? { contactName: contact.contactName } : {}),
    sourceChannel: "sms",
  });
  await ctx.runMutation(internal.ai.agents.runtime.clearConversationBookingState, {
    conversationId: input.conversationId,
  });
  return buildBookedAppointmentReply(input.service.name, input.startsAt, input.timezone);
}

async function maybeGenerateSmsSchedulingReply(
  ctx: ActionCtx,
  businessId: Id<"businesses">,
  conversationId: Id<"conversations">,
  prompt: string,
): Promise<string | null> {
  const snapshot = await ctx.runQuery(internal.ai.context.snapshots.getByBusinessId, {
    businessId,
  });
  if (!snapshot) {
    throw new Error("Business context snapshot is missing.");
  }

  const bookingState: ConversationBookingStateRecord | null = await ctx.runQuery(
    internal.ai.agents.runtime.getConversationBookingState,
    { conversationId },
  );
  const services: Array<Doc<"services">> = await ctx.runQuery(
    internal.voice.runtime.getActiveServicesForBusiness,
    { businessId },
  );
  const schedulingText = await getRelevantSchedulingText(
    ctx,
    conversationId,
    prompt,
    bookingState,
    services,
  );
  if (!schedulingText) {
    return null;
  }

  if (services.length === 0) {
    await ctx.runMutation(internal.ai.agents.runtime.clearConversationBookingState, {
      conversationId,
    });
    return "I can help with scheduling, but no bookable services are configured yet.";
  }

  const stateDate = getRequestedDateFromState(bookingState, snapshot.timezone);
  const explicitDate = resolveRequestedDate(
    schedulingText,
    snapshot.timezone,
    bookingState?.requestedDate ?? bookingState?.lastOfferedDate,
  );
  const service = resolveRequestedService(services, schedulingText, bookingState);
  const requestedDate =
    explicitDate ??
    ((shouldReuseStoredDate(prompt, bookingState) || service !== null) ? stateDate : null);
  const explicitTime = resolveRequestedTime(schedulingText);
  const requestedTime =
    explicitTime ??
    ((requestedDate !== null && service !== null) ? getRequestedTimeFromState(bookingState) : null);

  if (!service) {
    await ctx.runMutation(internal.ai.agents.runtime.saveConversationBookingState, {
      businessId,
      conversationId,
      ...(requestedDate !== null ? { requestedDate: requestedDate.isoDate } : {}),
      ...(requestedTime !== null ? { preferredHour24: requestedTime.hour24 } : {}),
      ...(requestedTime !== null ? { preferredMinute: requestedTime.minute } : {}),
      lastOfferedStartsAt: [],
    });
    return buildServiceSelectionReply(services);
  }

  const setup: { activeStaffCount: number; assignmentCount: number } = await ctx.runQuery(
    internal.voice.runtime.getActiveStaffAssignmentsForService,
    {
      businessId,
      serviceId: service._id,
    },
  );
  if (setup.assignmentCount === 0) {
    const setupIssue =
      setup.activeStaffCount === 0 ? "no_active_staff" : "no_staff_assigned";
    await ctx.runMutation(internal.ai.agents.runtime.saveConversationBookingState, {
      businessId,
      conversationId,
      selectedServiceId: service._id,
      ...(requestedDate !== null ? { requestedDate: requestedDate.isoDate } : {}),
      ...(requestedTime !== null ? { preferredHour24: requestedTime.hour24 } : {}),
      ...(requestedTime !== null ? { preferredMinute: requestedTime.minute } : {}),
      lastOfferedStartsAt: [],
    });
    return buildSetupIssueReply(service.name, setupIssue);
  }

  if (!requestedDate) {
    await ctx.runMutation(internal.ai.agents.runtime.saveConversationBookingState, {
      businessId,
      conversationId,
      selectedServiceId: service._id,
      ...(requestedTime !== null ? { preferredHour24: requestedTime.hour24 } : {}),
      ...(requestedTime !== null ? { preferredMinute: requestedTime.minute } : {}),
      lastOfferedStartsAt: [],
    });
    return `What date would you prefer for your ${service.name}?`;
  }

  const shouldConfirmPendingSlot =
    bookingState?.pendingStartsAt !== undefined &&
    looksLikeBookingConfirmation(prompt) &&
    explicitDate === null &&
    explicitTime === null &&
    !looksLikeAlternativeTimesRequest(prompt);
  if (shouldConfirmPendingSlot) {
    const pendingStartsAt = bookingState?.pendingStartsAt;
    if (!pendingStartsAt) {
      throw new Error("Pending SMS booking state is missing the slot to confirm.");
    }

    return await bookConversationAppointment(ctx, {
      businessId,
      conversationId,
      service,
      startsAt: pendingStartsAt,
      timezone: snapshot.timezone,
    });
  }

  const wantsAlternativeTimes = looksLikeAlternativeTimesRequest(prompt);
  if (!requestedTime || wantsAlternativeTimes) {
    const slots: Array<{ startsAt: string; endsAt: string; displayTime: string }> =
      await ctx.runQuery(internal.appointments.booking.findAvailabilityForBusiness, {
        businessId,
        serviceId: service._id,
        date: requestedDate.isoDate,
        timezone: snapshot.timezone,
        ...(requestedTime !== null ? { preferredHour24: requestedTime.hour24 } : {}),
        ...(requestedTime !== null ? { preferredMinute: requestedTime.minute } : {}),
        limit: wantsAlternativeTimes ? 6 : 3,
      });

    const unseenSlots =
      wantsAlternativeTimes && bookingState?.lastOfferedStartsAt?.length
        ? slots.filter((slot) => !bookingState.lastOfferedStartsAt?.includes(slot.startsAt))
        : slots;
    const responseSlots = (unseenSlots.length > 0 ? unseenSlots : slots).slice(0, 3);

    await ctx.runMutation(internal.ai.agents.runtime.saveConversationBookingState, {
      businessId,
      conversationId,
      selectedServiceId: service._id,
      requestedDate: requestedDate.isoDate,
      ...(requestedTime !== null ? { preferredHour24: requestedTime.hour24 } : {}),
      ...(requestedTime !== null ? { preferredMinute: requestedTime.minute } : {}),
      lastOfferedDate: requestedDate.isoDate,
      lastOfferedStartsAt: responseSlots.map((slot) => slot.startsAt),
    });

    return buildAvailabilityReply({
      serviceName: service.name,
      dateLabel: requestedDate.label,
      requestedTime,
      slots: responseSlots,
    });
  }

  const requestedStartLocal = requestedDate.dayStart.plus({
    hours: requestedTime.hour24,
    minutes: requestedTime.minute,
  });
  const startsAt = requestedStartLocal.toUTC().toISO() ?? requestedStartLocal.toISO();
  if (!startsAt) {
    throw new Error("Unable to compute the requested appointment time.");
  }

  const shouldBookRequestedTime =
    looksLikeBookingConfirmation(prompt) &&
    findMatchingOfferedSlot(bookingState, snapshot.timezone, requestedDate, requestedTime) !==
      null;
  if (shouldBookRequestedTime) {
    return await bookConversationAppointment(ctx, {
      businessId,
      startsAt,
      service,
      timezone: snapshot.timezone,
      conversationId,
    });
  }

  const selectedOfferedSlot = findMatchingOfferedSlot(
    bookingState,
    snapshot.timezone,
    requestedDate,
    requestedTime,
  );
  if (selectedOfferedSlot !== null) {
    await ctx.runMutation(internal.ai.agents.runtime.saveConversationBookingState, {
      businessId,
      conversationId,
      selectedServiceId: service._id,
      requestedDate: requestedDate.isoDate,
      preferredHour24: requestedTime.hour24,
      preferredMinute: requestedTime.minute,
      lastOfferedDate: requestedDate.isoDate,
      lastOfferedStartsAt: [selectedOfferedSlot],
      pendingStartsAt: selectedOfferedSlot,
    });
    return buildPendingBookingReply(service.name, selectedOfferedSlot, snapshot.timezone);
  }

  const exactAvailability: Array<{
    staffId: string;
    serviceId: string;
    startsAt: string;
    endsAt: string;
  }> = await ctx.runQuery(internal.appointments.booking.checkAvailabilityForBusiness, {
    businessId,
    serviceId: service._id,
    startsAt,
    timezone: snapshot.timezone,
  });

  if (exactAvailability.length > 0) {
    await ctx.runMutation(internal.ai.agents.runtime.saveConversationBookingState, {
      businessId,
      conversationId,
      selectedServiceId: service._id,
      requestedDate: requestedDate.isoDate,
      preferredHour24: requestedTime.hour24,
      preferredMinute: requestedTime.minute,
      lastOfferedDate: requestedDate.isoDate,
      lastOfferedStartsAt: [startsAt],
      pendingStartsAt: startsAt,
    });
    return buildPendingBookingReply(service.name, startsAt, snapshot.timezone);
  }

  const nearbySlots: Array<{ startsAt: string; endsAt: string; displayTime: string }> =
    await ctx.runQuery(internal.appointments.booking.findAvailabilityForBusiness, {
      businessId,
      serviceId: service._id,
      date: requestedDate.isoDate,
      timezone: snapshot.timezone,
      preferredHour24: requestedTime.hour24,
      preferredMinute: requestedTime.minute,
      limit: 3,
    });

  await ctx.runMutation(internal.ai.agents.runtime.saveConversationBookingState, {
    businessId,
    conversationId,
    selectedServiceId: service._id,
    requestedDate: requestedDate.isoDate,
    preferredHour24: requestedTime.hour24,
    preferredMinute: requestedTime.minute,
    lastOfferedDate: requestedDate.isoDate,
    lastOfferedStartsAt: nearbySlots.map((slot) => slot.startsAt),
  });

  return buildAvailabilityReply({
    serviceName: service.name,
    dateLabel: requestedDate.label,
    requestedTime,
    slots: nearbySlots,
  });
}

export const requireMembershipByUserId = internalQuery({
  args: {
    businessId: v.id("businesses"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("business_memberships")
      .withIndex("by_user_id_and_business_id", (q) =>
        q.eq("userId", args.userId).eq("businessId", args.businessId),
      )
      .unique();
  },
});

export const getConversationAiState = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversation_ai_state")
      .withIndex("by_conversation_id", (q) => q.eq("conversationId", args.conversationId))
      .unique();
  },
});

export const getConversationBookingState = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<ConversationBookingStateRecord | null> => {
    return await ctx.db
      .query("conversation_booking_state")
      .withIndex("by_conversation_id", (q) => q.eq("conversationId", args.conversationId))
      .unique();
  },
});

export const saveConversationBookingState = internalMutation({
  args: {
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
    selectedServiceId: v.optional(v.id("services")),
    requestedDate: v.optional(v.string()),
    preferredHour24: v.optional(v.number()),
    preferredMinute: v.optional(v.number()),
    lastOfferedDate: v.optional(v.string()),
    lastOfferedStartsAt: v.optional(v.array(v.string())),
    pendingStartsAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("conversation_booking_state")
      .withIndex("by_conversation_id", (q) => q.eq("conversationId", args.conversationId))
      .unique();

    const nextState = {
      businessId: args.businessId,
      conversationId: args.conversationId,
      updatedAt: new Date().toISOString(),
      ...(args.selectedServiceId !== undefined
        ? { selectedServiceId: args.selectedServiceId }
        : {}),
      ...(args.requestedDate !== undefined ? { requestedDate: args.requestedDate } : {}),
      ...(args.preferredHour24 !== undefined ? { preferredHour24: args.preferredHour24 } : {}),
      ...(args.preferredMinute !== undefined ? { preferredMinute: args.preferredMinute } : {}),
      ...(args.lastOfferedDate !== undefined ? { lastOfferedDate: args.lastOfferedDate } : {}),
      ...(args.lastOfferedStartsAt !== undefined
        ? { lastOfferedStartsAt: args.lastOfferedStartsAt }
        : {}),
      ...(args.pendingStartsAt !== undefined ? { pendingStartsAt: args.pendingStartsAt } : {}),
    };

    if (existing) {
      await ctx.db.replace(existing._id, nextState);
      return existing._id;
    }

    return await ctx.db.insert("conversation_booking_state", nextState);
  },
});

export const clearConversationBookingState = internalMutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("conversation_booking_state")
      .withIndex("by_conversation_id", (q) => q.eq("conversationId", args.conversationId))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});

export const getConversationSmsContact = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<ConversationSmsContact | null> => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation?.contactId) {
      return null;
    }

    const contact = await ctx.db.get(conversation.contactId);
    if (!contact) {
      return null;
    }

    return {
      contactPhone: contact.phone,
      ...(contact.name !== undefined ? { contactName: contact.name } : {}),
    };
  },
});

export const getRecentConversationMessages = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<Array<RecentConversationMessage>> => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_id", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .take(args.limit ?? 6);

    return messages.reverse().map((message) => ({
      direction: message.direction,
      body: message.body,
      _creationTime: message._creationTime,
    }));
  },
});

export const storeConversationThread = internalMutation({
  args: {
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("conversation_ai_state")
      .withIndex("by_conversation_id", (q) => q.eq("conversationId", args.conversationId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { threadId: args.threadId });
      return existing._id;
    }

    return await ctx.db.insert("conversation_ai_state", args);
  },
});

async function ensureConversationThread(
  ctx: ActionCtx,
  businessId: Id<"businesses">,
  conversationId: Id<"conversations">,
): Promise<string> {
  const existing = await ctx.runQuery(internal.ai.agents.runtime.getConversationAiState, {
    conversationId,
  });

  if (existing) {
    return existing.threadId;
  }

  const threadId = await createThread(ctx, receptionistAgent.component, {
    title: `Conversation ${String(conversationId)}`,
    summary: `Business ${String(businessId)} conversation`,
  });

  await ctx.runMutation(internal.ai.agents.runtime.storeConversationThread, {
    businessId,
    conversationId,
    threadId,
  });

  return threadId;
}

async function generateGroundedReply(
  ctx: ActionCtx,
  businessId: Id<"businesses">,
  conversationId: Id<"conversations">,
  prompt: string,
): Promise<string> {
  const snapshot = await ctx.runQuery(internal.ai.context.snapshots.getByBusinessId, {
    businessId,
  });
  if (!snapshot) {
    throw new Error("Business context snapshot is missing.");
  }

  const schedulingReply = await maybeGenerateSmsSchedulingReply(
    ctx,
    businessId,
    conversationId,
    prompt,
  );
  if (schedulingReply) {
    return schedulingReply;
  }

  const knowledge = await ctx.runAction(
    internal.ai.context.knowledge.searchKnowledgeInternal,
    {
      businessId,
      query: prompt,
      limit: 4,
    },
  );

  const threadId = await ensureConversationThread(ctx, businessId, conversationId);
  const result = await receptionistAgent.generateText(
    ctx,
    { threadId },
    {
      prompt: buildGroundedPrompt({
        smsInstructions: snapshot.smsInstructions,
        summary: snapshot.summary,
        bookingPolicy: snapshot.bookingPolicy,
        knowledgeDigest: snapshot.knowledgeDigest,
        hoursCount: snapshot.hours.length,
        timezone: snapshot.timezone,
        businessNowLabel: buildBusinessNowLabel(snapshot.timezone),
        services: snapshot.services,
        knowledge,
        prompt,
      }),
    } as any,
  );
  return result.text;
}

// Convex action builder types can exceed local tsc recursion depth here.
// @ts-ignore Deep type instantiation from Convex action generics.
export const generateSmsReply = internalAction({
  args: {
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    return await generateGroundedReply(
      ctx,
      args.businessId,
      args.conversationId,
      args.prompt,
    );
  },
});

// @ts-ignore Deep type instantiation from Convex action generics.
export const previewReplyInternal = internalAction({
  args: {
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    return {
      text: await generateGroundedReply(
        ctx,
        args.businessId,
        args.conversationId,
        args.prompt,
      ),
    };
  },
});
