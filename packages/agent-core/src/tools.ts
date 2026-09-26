import { appendMessage, createVoiceFollowUpTask, findAvailability, getOrCreateConversation, type DomainContext } from "@lobbystack/domain";
import type { BusinessContextSnapshot, ServiceSummary } from "@lobbystack/shared";
import { tool, type ToolSet } from "ai";
import { DateTime } from "luxon";
import { z } from "zod";

export type AgentChannel = "voice" | "chat";

export type AgentToolContext = {
  domain: DomainContext;
  snapshot: BusinessContextSnapshot;
  channel: AgentChannel;
  callerPhone?: string;
  callId?: string;
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatMinutes(minutes: number): string {
  return DateTime.fromObject({ hour: Math.floor(minutes / 60), minute: minutes % 60 }).toFormat("h:mm a");
}

function matchService(services: ServiceSummary[], name: string): ServiceSummary | undefined {
  const wanted = name.trim().toLowerCase();
  const names = (service: ServiceSummary) => [service.name, ...Object.values(service.localizedNames ?? {})].map((value) => value.toLowerCase());
  return services.find((service) => names(service).includes(wanted))
    ?? services.find((service) => names(service).some((value) => value.includes(wanted) || wanted.includes(value)));
}

export function createReceptionistTools(context: AgentToolContext): ToolSet {
  const { domain, snapshot } = context;
  const businessId = snapshot.businessId;

  return {
    getBusinessHours: tool({
      description: "Get the business's weekly opening hours, upcoming closures, and whether it is open right now.",
      inputSchema: z.object({}),
      execute: async () => {
        const now = DateTime.now().setZone(snapshot.timezone);
        const minutesNow = now.hour * 60 + now.minute;
        const today = now.weekday % 7;
        const openNow = snapshot.hours.some((window) => window.dayOfWeek === today && minutesNow >= window.openMinutes && minutesNow < window.closeMinutes)
          && !snapshot.closures.some((closure) => now >= DateTime.fromISO(closure.startsAt) && now < DateTime.fromISO(closure.endsAt));
        return {
          timezone: snapshot.timezone,
          now: now.toFormat("cccc h:mm a"),
          openNow,
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

    findAvailability: tool({
      description: "Find open appointment times for one service on one date. Never state availability without calling this.",
      inputSchema: z.object({
        serviceName: z.string().describe("The service the caller wants, as close as possible to one of the business's services."),
        date: z.string().describe("The requested date as YYYY-MM-DD in the business's timezone."),
        preferredTime: z.string().optional().describe("Preferred start time as HH:mm (24-hour), if the caller gave one."),
      }),
      execute: async ({ serviceName, date, preferredTime }) => {
        const service = matchService(snapshot.services, serviceName);
        if (!service) return { ok: false, reason: "No matching service.", services: snapshot.services.map((item) => item.name) };
        const [hour = 9, minute = 0] = (preferredTime ?? "09:00").split(":").map(Number);
        const startsAt = DateTime.fromISO(date, { zone: snapshot.timezone }).set({ hour, minute }).toUTC().toISO();
        if (!startsAt) return { ok: false, reason: "The date is not valid." };
        const slots = await findAvailability(domain, { businessId, serviceId: service.id, startsAt, timezone: snapshot.timezone });
        return {
          ok: true,
          service: service.name,
          date,
          openings: slots.slice(0, 5).map((slot) => DateTime.fromISO(slot.startsAt).setZone(snapshot.timezone).toFormat("cccc LLL d, h:mm a")),
        };
      },
    }),

    takeMessage: tool({
      description: "Save a message for the business's staff to follow up on. Collect the caller's name and callback number first.",
      inputSchema: z.object({
        message: z.string().describe("What the caller needs, in their words, summarised for staff."),
        callerName: z.string().optional(),
        callbackPhone: z.string().optional().describe("Callback number in E.164 format if the caller gave one."),
        urgency: z.enum(["low", "normal", "urgent"]).optional(),
      }),
      execute: async ({ message, callerName, callbackPhone, urgency }) => {
        const phone = callbackPhone ?? context.callerPhone;
        const conversation = await getOrCreateConversation(domain, { businessId, contactPhone: phone ?? "unknown", channel: context.channel });
        await appendMessage(domain, {
          businessId,
          conversationId: conversation.conversationId,
          body: message,
          direction: "inbound",
          channel: "dashboard",
          operatorAlert: { eventKind: "voiceMessage", subject: "New voice message", body: "A caller left a voice message. Open the inbox to review it." },
        });
        await createVoiceFollowUpTask(domain, {
          businessId,
          message,
          ...(context.callId ? { callId: context.callId } : {}),
          ...(callerName ? { callerName } : {}),
          ...(phone ? { callbackPhone: phone } : {}),
          ...(urgency ? { urgency } : {}),
        });
        return { ok: true, saved: true };
      },
    }),
  };
}

