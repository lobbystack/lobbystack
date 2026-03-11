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

function looksLikeSchedulingFollowUp(text: string): boolean {
  return (
    /\b(today|tomorrow|morning|afternoon|evening|noon|next week)\b/i.test(text) ||
    /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i.test(text) ||
    /\b\d{4}-\d{1,2}-\d{1,2}\b/.test(text) ||
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(text)
  );
}

function resolveRequestedDate(
  text: string,
  timezone: string,
): SmsDatePreference | null {
  const localNow = DateTime.now().setZone(timezone);

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

async function getRelevantSchedulingText(
  ctx: ActionCtx,
  conversationId: Id<"conversations">,
  prompt: string,
): Promise<string | null> {
  if (looksLikeSchedulingRequest(prompt)) {
    return prompt;
  }

  if (!looksLikeSchedulingFollowUp(prompt)) {
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
): Doc<"services"> | null {
  if (services.length === 1) {
    return services[0] ?? null;
  }

  const ranked = services
    .map((service) => ({
      service,
      score: scoreServiceMatch(service, schedulingText),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  const topCandidate = ranked[0];
  const runnerUp = ranked[1];
  if (!topCandidate) {
    return null;
  }

  if (runnerUp && topCandidate.score === runnerUp.score) {
    return null;
  }

  return topCandidate.service;
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
    return `I do not have ${input.serviceName} available on ${input.dateLabel} at ${input.requestedTime.label}. The closest available times are ${slotSummary}.`;
  }

  return `The next available ${input.serviceName} times on ${input.dateLabel} are ${slotSummary}.`;
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

  const schedulingText = await getRelevantSchedulingText(ctx, conversationId, prompt);
  if (!schedulingText) {
    return null;
  }

  const services: Array<Doc<"services">> = await ctx.runQuery(
    internal.voice.runtime.getActiveServicesForBusiness,
    { businessId },
  );
  if (services.length === 0) {
    return "I can help with scheduling, but no bookable services are configured yet.";
  }

  const service = resolveRequestedService(services, schedulingText);
  if (!service) {
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
    return buildSetupIssueReply(service.name, setupIssue);
  }

  const requestedDate = resolveRequestedDate(schedulingText, snapshot.timezone);
  if (!requestedDate) {
    return "What date would you like to come in?";
  }

  const requestedTime = resolveRequestedTime(schedulingText);
  if (!requestedTime) {
    const slots: Array<{ startsAt: string; endsAt: string; displayTime: string }> =
      await ctx.runQuery(internal.appointments.booking.findAvailabilityForBusiness, {
        businessId,
        serviceId: service._id,
        date: requestedDate.isoDate,
        timezone: snapshot.timezone,
        limit: 3,
      });

    return buildAvailabilityReply({
      serviceName: service.name,
      dateLabel: requestedDate.label,
      slots,
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
    return `${service.name} is currently available on ${requestedDate.label} at ${requestedTime.label}.`;
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
