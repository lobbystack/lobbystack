import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { workflowManager } from "../lib/components";
import {
  normalizeAppointmentChangePolicy,
  type AppointmentChangePolicy,
} from "../lib/appointmentChangePolicy";
import { getServiceNameCandidates } from "../lib/serviceNames";

const VERIFICATION_TTL_MS = 10 * 60 * 1000;

type AppointmentChangeAction = "cancel" | "reschedule";
type AppointmentChangeVerificationStatus =
  | "facts_verified"
  | "otp_pending"
  | "otp_verified"
  | "blocked";

type AppointmentChangeLookupResult = {
  ok: true;
  policy: AppointmentChangePolicy;
  phoneMatched: boolean;
  appointmentCount: number;
  hasConfirmedAppointments: boolean;
  appointments: Array<Record<string, never>>;
};

type AppointmentChangeVerifyResult =
  | {
      ok: true;
      verified: true;
      requiresOtp: boolean;
      verificationId: Id<"appointment_change_verifications">;
      appointmentId: Id<"appointments">;
      contactId: Id<"contacts">;
      status: AppointmentChangeVerificationStatus;
    }
  | {
      ok: false;
      verified: false;
      reason: string;
    };

type AppointmentChangeMutationResult =
  | {
      ok: true;
      action: AppointmentChangeAction;
      appointmentId: Id<"appointments">;
      serviceId: Id<"services">;
      startsAt: string;
      endsAt: string;
      status: string;
      calendarSyncState: Doc<"appointments">["calendarSyncState"];
    }
  | {
      ok: false;
      action: AppointmentChangeAction;
      reason: string;
    };

function normalizePhoneForComparison(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

function phonesMatch(left: string, right: string): boolean {
  const normalizedLeft = normalizePhoneForComparison(left);
  const normalizedRight = normalizePhoneForComparison(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  if (normalizedLeft === normalizedRight) {
    return true;
  }

  const leftDigits = normalizedLeft.replace(/\D/g, "");
  const rightDigits = normalizedRight.replace(/\D/g, "");
  return (
    leftDigits.length >= 10 &&
    rightDigits.length >= 10 &&
    leftDigits.slice(-10) === rightDigits.slice(-10)
  );
}

function normalizeComparable(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function tokenizeComparable(value: string): Array<string> {
  return normalizeComparable(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function personNamesMatch(storedName: string | undefined, providedName: string | undefined): boolean {
  if (!storedName?.trim() || !providedName?.trim()) {
    return false;
  }

  const stored = normalizeComparable(storedName);
  const provided = normalizeComparable(providedName);
  if (!stored || !provided) {
    return false;
  }
  if (stored === provided || stored.includes(provided) || provided.includes(stored)) {
    return true;
  }

  const storedTokens = tokenizeComparable(storedName);
  const providedTokens = new Set(tokenizeComparable(providedName));
  return storedTokens.length > 0 && storedTokens.every((token) => providedTokens.has(token));
}

function storedContactNameMatchesIfPresent(
  storedName: string | undefined,
  providedName: string | undefined,
): boolean {
  return !storedName?.trim() || personNamesMatch(storedName, providedName);
}

function serviceNamesMatch(service: Doc<"services">, providedServiceName: string): boolean {
  const provided = normalizeComparable(providedServiceName);
  if (!provided) {
    return false;
  }

  return getServiceNameCandidates(service)
    .map((candidate) => normalizeComparable(candidate))
    .some(
      (candidate) =>
        candidate === provided ||
        candidate.includes(provided) ||
        provided.includes(candidate),
    );
}

function substantiveServiceNameFactMatches(
  service: Doc<"services">,
  providedServiceName: string,
): boolean {
  const provided = normalizeComparable(providedServiceName);
  if (!provided) {
    return false;
  }

  const candidates = getServiceNameCandidates(service).map((candidate) =>
    normalizeComparable(candidate),
  );
  if (candidates.some((candidate) => candidate === provided)) {
    return true;
  }

  const providedTokens = tokenizeComparable(provided).filter((token) => token.length >= 3);
  if (providedTokens.length === 0) {
    return false;
  }

  return candidates.some((candidate) => {
    const candidateTokens = tokenizeComparable(candidate);
    return providedTokens.every((providedToken) =>
      candidateTokens.some(
        (candidateToken) =>
          candidateToken === providedToken ||
          (providedToken.length >= 4 && candidateToken.startsWith(providedToken)),
      ),
    );
  });
}

function appointmentTimesMatch(
  appointment: Doc<"appointments">,
  providedStartsAt: string,
): boolean {
  const actualMs = Date.parse(appointment.startsAt);
  const providedMs = Date.parse(providedStartsAt);
  if (!Number.isFinite(actualMs)) {
    return false;
  }

  if (Number.isFinite(providedMs) && Math.abs(actualMs - providedMs) <= 30 * 60 * 1000) {
    return true;
  }

  if (Number.isFinite(providedMs) && /\b(?:19|20)\d{2}\b/.test(providedStartsAt)) {
    return false;
  }

  return appointmentLocalTimeFactMatches(appointment, providedStartsAt);
}

const MONTHS_BY_NAME = new Map(
  [
    ["jan", 1],
    ["january", 1],
    ["feb", 2],
    ["february", 2],
    ["mar", 3],
    ["march", 3],
    ["apr", 4],
    ["april", 4],
    ["may", 5],
    ["jun", 6],
    ["june", 6],
    ["jul", 7],
    ["july", 7],
    ["aug", 8],
    ["august", 8],
    ["sep", 9],
    ["sept", 9],
    ["september", 9],
    ["oct", 10],
    ["october", 10],
    ["nov", 11],
    ["november", 11],
    ["dec", 12],
    ["december", 12],
  ].map(([name, month]) => [name, month as number]),
);

const WEEKDAYS_BY_NAME = new Map(
  [
    ["sun", 0],
    ["sunday", 0],
    ["mon", 1],
    ["monday", 1],
    ["tue", 2],
    ["tues", 2],
    ["tuesday", 2],
    ["wed", 3],
    ["wednesday", 3],
    ["thu", 4],
    ["thur", 4],
    ["thurs", 4],
    ["thursday", 4],
    ["fri", 5],
    ["friday", 5],
    ["sat", 6],
    ["saturday", 6],
  ].map(([name, weekday]) => [name, weekday as number]),
);

type LocalAppointmentDateTime = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
};

function getAppointmentLocalDateTime(
  appointment: Doc<"appointments">,
): LocalAppointmentDateTime | null {
  const date = new Date(appointment.startsAt);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: appointment.timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = Number(value("year"));
  const month = Number(value("month"));
  const day = Number(value("day"));
  const weekday = WEEKDAYS_BY_NAME.get(value("weekday")?.toLowerCase() ?? "");
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    weekday === undefined ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    return null;
  }

  return { year, month, day, weekday, hour, minute };
}

function getBusinessRelativeLocalDate(
  timezone: string,
  daysFromToday: number,
): Pick<LocalAppointmentDateTime, "year" | "month" | "day"> | null {
  const target = new Date(Date.now() + daysFromToday * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(target);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = Number(value("year"));
  const month = Number(value("month"));
  const day = Number(value("day"));

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  return { year, month, day };
}

function parseProvidedClockTime(input: string):
  | {
      hour: number;
      minute: number;
      hasMeridiem: boolean;
    }
  | null {
  const meridiemMatch = input.match(
    /\b(\d{1,2})(?:(?::|\s)(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/,
  );
  if (meridiemMatch) {
    const rawHour = Number(meridiemMatch[1]);
    const minute = meridiemMatch[2] ? Number(meridiemMatch[2]) : 0;
    if (rawHour < 1 || rawHour > 12 || minute < 0 || minute > 59) {
      return null;
    }
    const isPm = meridiemMatch[3]?.startsWith("p") ?? false;
    return {
      hour: rawHour === 12 ? (isPm ? 12 : 0) : rawHour + (isPm ? 12 : 0),
      minute,
      hasMeridiem: true,
    };
  }

  const hourSuffixMatch = input.match(/\b(\d{1,2})\s*h(?:\s*(\d{2}))?\b/);
  if (hourSuffixMatch) {
    const hour = Number(hourSuffixMatch[1]);
    const minute = hourSuffixMatch[2] ? Number(hourSuffixMatch[2]) : 0;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null;
    }
    return { hour, minute, hasMeridiem: true };
  }

  const qualifiedTimeMatch = input.match(
    /\b(?:at|around|about|near|vers|a|à)\s+(\d{1,2})(?:(?::|\s)(\d{2}))?\b/,
  );
  const bareTimeMatch = input.trim().match(/^(\d{1,2})(?:(?::|\s)(\d{2}))?$/);
  const match = qualifiedTimeMatch ?? bareTimeMatch;
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (hour < 1 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return { hour, minute, hasMeridiem: false };
}

function appointmentDayPartMatches(hour: number, input: string): boolean | null {
  if (/\b(morning|matin)\b/.test(input)) {
    return hour >= 5 && hour < 12;
  }
  if (/\b(afternoon|apres midi|apres-midi|apr s midi)\b/.test(input)) {
    return hour >= 12 && hour < 17;
  }
  if (/\b(evening|soir|soiree|soir e)\b/.test(input)) {
    return hour >= 17 && hour < 21;
  }
  if (/\b(night|tonight|nuit)\b/.test(input)) {
    return hour >= 21 || hour < 5;
  }
  return null;
}

function appointmentLocalTimeFactMatches(
  appointment: Doc<"appointments">,
  providedStartsAt: string,
): boolean {
  const local = getAppointmentLocalDateTime(appointment);
  if (!local) {
    return false;
  }

  const raw = providedStartsAt.trim().toLowerCase();
  const normalized = normalizeComparable(providedStartsAt);
  if (!normalized) {
    return false;
  }

  let hasDateSignal = false;

  const yearMatch = normalized.match(/\b((?:19|20)\d{2})\b/);
  if (yearMatch) {
    hasDateSignal = true;
    if (Number(yearMatch[1]) !== local.year) {
      return false;
    }
  }

  const monthDayMatch = normalized.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/,
  );
  const dayMonthMatch = normalized.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/,
  );
  if (monthDayMatch || dayMonthMatch) {
    hasDateSignal = true;
    const month = monthDayMatch
      ? MONTHS_BY_NAME.get(monthDayMatch[1] ?? "")
      : MONTHS_BY_NAME.get(dayMonthMatch?.[2] ?? "");
    const day = Number(monthDayMatch?.[2] ?? dayMonthMatch?.[1]);
    if (month !== local.month || day !== local.day) {
      return false;
    }
  }

  const weekday = [...WEEKDAYS_BY_NAME.entries()].find(([name]) =>
    new RegExp(`\\b${name}\\b`).test(normalized),
  )?.[1];
  if (weekday !== undefined) {
    hasDateSignal = true;
    if (weekday !== local.weekday) {
      return false;
    }
  }

  const relativeDay = /\b(tomorrow|tmrw|demain)\b/.test(normalized)
    ? getBusinessRelativeLocalDate(appointment.timezone, 1)
    : /\b(today|aujourd hui)\b/.test(normalized)
      ? getBusinessRelativeLocalDate(appointment.timezone, 0)
      : null;
  if (relativeDay) {
    hasDateSignal = true;
    if (
      relativeDay.year !== local.year ||
      relativeDay.month !== local.month ||
      relativeDay.day !== local.day
    ) {
      return false;
    }
  }

  const clockTime = parseProvidedClockTime(raw);
  const dayPartMatches = appointmentDayPartMatches(local.hour, normalized);
  if (clockTime) {
    const minuteMatches = Math.abs(local.minute - clockTime.minute) <= 30;
    const hourMatches = clockTime.hasMeridiem
      ? local.hour === clockTime.hour
      : local.hour === clockTime.hour ||
        local.hour % 12 === clockTime.hour % 12;
    return hourMatches && minuteMatches;
  }

  if (dayPartMatches !== null) {
    return dayPartMatches && hasDateSignal;
  }

  return false;
}

function actionAllowed(policy: AppointmentChangePolicy, action: AppointmentChangeAction): boolean {
  if (!policy.enabled || policy.verificationMode === "operator_only") {
    return false;
  }

  return action === "cancel" ? policy.allowCancel : policy.allowReschedule;
}

async function getAppointmentChangePolicy(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  businessId: Id<"businesses">,
): Promise<AppointmentChangePolicy> {
  const profile = await ctx.db
    .query("receptionist_profiles")
    .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
    .unique();
  return normalizeAppointmentChangePolicy(profile?.appointmentChangePolicy);
}

async function loadVerifiedAppointmentContext(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  input: {
    businessId: Id<"businesses">;
    appointmentId: Id<"appointments">;
  },
): Promise<{
  appointment: Doc<"appointments">;
  contact: Doc<"contacts">;
  service: Doc<"services">;
} | null> {
  const appointment = await ctx.db.get(input.appointmentId);
  if (!appointment || appointment.businessId !== input.businessId) {
    return null;
  }

  const [contact, service] = await Promise.all([
    ctx.db.get(appointment.contactId),
    ctx.db.get(appointment.serviceId),
  ]);
  if (!contact || !service || contact.businessId !== input.businessId || service.businessId !== input.businessId) {
    return null;
  }

  return { appointment, contact, service };
}

async function loadConfirmedAppointmentChangeContextsForCaller(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  input: {
    businessId: Id<"businesses">;
    callerPhone: string;
  },
): Promise<{
  contact: Doc<"contacts"> | null;
  contexts: Array<{
    appointment: Doc<"appointments">;
    contact: Doc<"contacts">;
    service: Doc<"services">;
  }>;
}> {
  const contact = await ctx.db
    .query("contacts")
    .withIndex("by_business_id_and_phone", (q) =>
      q.eq("businessId", input.businessId).eq("phone", input.callerPhone),
    )
    .unique();

  if (!contact || !phonesMatch(contact.phone, input.callerPhone)) {
    return { contact: null, contexts: [] };
  }

  const nowIso = new Date().toISOString();
  const appointments = await ctx.db
    .query("appointments")
    .withIndex("by_contact_id_and_starts_at", (q) =>
      q.eq("contactId", contact._id).gte("startsAt", nowIso),
    )
    .collect();
  const confirmed = appointments.filter(
    (appointment) =>
      appointment.businessId === input.businessId &&
      appointment.status === "confirmed",
  );
  const services = await Promise.all(
    confirmed.map((appointment) => ctx.db.get(appointment.serviceId)),
  );

  return {
    contact,
    contexts: confirmed.flatMap((appointment, index) => {
      const service = services[index];
      if (!service || service.businessId !== input.businessId) {
        return [];
      }
      return [{ appointment, contact, service }];
    }),
  };
}

async function findLatestVerification(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  input: {
    appointmentId: Id<"appointments">;
    callerPhone: string;
    verificationId?: Id<"appointment_change_verifications">;
    callId?: Id<"calls">;
    conversationId?: Id<"conversations">;
  },
): Promise<Doc<"appointment_change_verifications"> | null> {
  if (input.verificationId) {
    const verification = await ctx.db.get(input.verificationId);
    if (
      verification &&
      verification.appointmentId === input.appointmentId &&
      phonesMatch(verification.callerPhone, input.callerPhone)
    ) {
      return verification;
    }
    return null;
  }

  const candidates: Array<Doc<"appointment_change_verifications">> = [];
  if (input.callId) {
    candidates.push(
      ...(await ctx.db
        .query("appointment_change_verifications")
        .withIndex("by_call_id", (q) => q.eq("callId", input.callId))
        .collect()),
    );
  }
  if (input.conversationId) {
    candidates.push(
      ...(await ctx.db
        .query("appointment_change_verifications")
        .withIndex("by_conversation_id", (q) => q.eq("conversationId", input.conversationId))
        .collect()),
    );
  }

  return (
    candidates
      .filter(
        (verification, index, all) =>
          all.findIndex((candidate) => candidate._id === verification._id) === index &&
          verification.appointmentId === input.appointmentId &&
          phonesMatch(verification.callerPhone, input.callerPhone),
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null
  );
}

function verificationSatisfiesPolicy(
  verification: Doc<"appointment_change_verifications"> | null,
  policy: AppointmentChangePolicy,
  nowIso: string,
): boolean {
  if (!verification || verification.expiresAt < nowIso) {
    return false;
  }

  if (policy.verificationMode === "otp_required") {
    return verification.status === "otp_verified";
  }

  return verification.status === "facts_verified" || verification.status === "otp_verified";
}

async function saveVerificationSession(
  ctx: MutationCtx,
  input: {
    businessId: Id<"businesses">;
    appointmentId: Id<"appointments">;
    contactId: Id<"contacts">;
    callId?: Id<"calls">;
    conversationId?: Id<"conversations">;
    channel: string;
    callerPhone: string;
    verificationMode: AppointmentChangePolicy["verificationMode"];
    status: AppointmentChangeVerificationStatus;
    otpPhone?: string;
  },
): Promise<Id<"appointment_change_verifications">> {
  const nowIso = new Date().toISOString();
  const existing = await findLatestVerification(ctx, {
    appointmentId: input.appointmentId,
    callerPhone: input.callerPhone,
    ...(input.callId ? { callId: input.callId } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
  });
  const patch = {
    businessId: input.businessId,
    appointmentId: input.appointmentId,
    contactId: input.contactId,
    ...(input.callId ? { callId: input.callId } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    channel: input.channel,
    callerPhone: input.callerPhone,
    verificationMode: input.verificationMode,
    status: input.status,
    ...(input.otpPhone ? { otpPhone: input.otpPhone } : {}),
    ...(input.status === "facts_verified" || input.status === "otp_verified"
      ? { verifiedAt: nowIso }
      : {}),
    expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS).toISOString(),
    attemptCount: existing?.attemptCount ?? 0,
    updatedAt: nowIso,
  };

  if (existing) {
    await ctx.db.patch(existing._id, patch);
    return existing._id;
  }

  return await ctx.db.insert("appointment_change_verifications", {
    ...patch,
    createdAt: nowIso,
  });
}

async function recordAppointmentChangeAudit(
  ctx: MutationCtx,
  input: {
    appointment: Doc<"appointments">;
    contactId: Id<"contacts">;
    verificationId?: Id<"appointment_change_verifications">;
    action: AppointmentChangeAction;
    channel: string;
    callerPhone: string;
    verificationMode: AppointmentChangePolicy["verificationMode"];
    status: string;
    newStatus?: string;
    newStartsAt?: string;
    newEndsAt?: string;
    newStaffId?: Id<"staff">;
    payload?: unknown;
  },
): Promise<void> {
  await ctx.db.insert("appointment_change_audit_logs", {
    businessId: input.appointment.businessId,
    appointmentId: input.appointment._id,
    contactId: input.contactId,
    ...(input.verificationId ? { verificationId: input.verificationId } : {}),
    action: input.action,
    channel: input.channel,
    callerPhone: input.callerPhone,
    verificationMode: input.verificationMode,
    status: input.status,
    oldStatus: input.appointment.status,
    oldStartsAt: input.appointment.startsAt,
    oldEndsAt: input.appointment.endsAt,
    oldStaffId: input.appointment.staffId,
    ...(input.newStatus ? { newStatus: input.newStatus } : {}),
    ...(input.newStartsAt ? { newStartsAt: input.newStartsAt } : {}),
    ...(input.newEndsAt ? { newEndsAt: input.newEndsAt } : {}),
    ...(input.newStaffId ? { newStaffId: input.newStaffId } : {}),
    ...(input.payload !== undefined ? { payload: JSON.stringify(input.payload) } : {}),
    createdAt: new Date().toISOString(),
  });
}

async function blockChangeAttempt(
  ctx: MutationCtx,
  input: {
    action: AppointmentChangeAction;
    reason: string;
    businessId: Id<"businesses">;
    appointmentId: Id<"appointments">;
    callerPhone: string;
    channel: string;
    verificationMode: AppointmentChangePolicy["verificationMode"];
    verificationId?: Id<"appointment_change_verifications">;
  },
): Promise<AppointmentChangeMutationResult> {
  const loaded = await loadVerifiedAppointmentContext(ctx, {
    businessId: input.businessId,
    appointmentId: input.appointmentId,
  });
  if (loaded) {
    await recordAppointmentChangeAudit(ctx, {
      appointment: loaded.appointment,
      contactId: loaded.contact._id,
      ...(input.verificationId ? { verificationId: input.verificationId } : {}),
      action: input.action,
      channel: input.channel,
      callerPhone: input.callerPhone,
      verificationMode: input.verificationMode,
      status: "blocked",
      payload: { reason: input.reason },
    });
  }

  return {
    ok: false,
    action: input.action,
    reason: input.reason,
  };
}

export const lookupAppointmentsForChange = internalQuery({
  args: {
    businessId: v.id("businesses"),
    callerPhone: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<AppointmentChangeLookupResult> => {
    const policy = await getAppointmentChangePolicy(ctx, args.businessId);
    const { contact, contexts } = await loadConfirmedAppointmentChangeContextsForCaller(
      ctx,
      args,
    );

    if (!contact) {
      return {
        ok: true,
        policy,
        phoneMatched: false,
        appointmentCount: 0,
        hasConfirmedAppointments: false,
        appointments: [],
      };
    }

    return {
      ok: true,
      policy,
      phoneMatched: true,
      appointmentCount: contexts.length,
      hasConfirmedAppointments: contexts.length > 0,
      appointments: [],
    };
  },
});

export const verifyAppointmentChangeFacts = internalMutation({
  args: {
    businessId: v.id("businesses"),
    appointmentId: v.optional(v.id("appointments")),
    action: v.union(v.literal("cancel"), v.literal("reschedule")),
    channel: v.string(),
    callerPhone: v.string(),
    callerName: v.optional(v.string()),
    appointmentStartsAt: v.optional(v.string()),
    serviceName: v.optional(v.string()),
    callId: v.optional(v.id("calls")),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<AppointmentChangeVerifyResult> => {
    const policy = await getAppointmentChangePolicy(ctx, args.businessId);
    if (!actionAllowed(policy, args.action)) {
      return { ok: false, verified: false, reason: "appointment_changes_not_allowed" };
    }

    const providedTime = args.appointmentStartsAt?.trim();
    const providedServiceName = args.serviceName?.trim();
    if (!providedTime && !providedServiceName) {
      return { ok: false, verified: false, reason: "missing_appointment_fact" };
    }

    let loaded:
      | {
          appointment: Doc<"appointments">;
          contact: Doc<"contacts">;
          service: Doc<"services">;
        }
      | null = null;

    if (args.appointmentId) {
      loaded = await loadVerifiedAppointmentContext(ctx, {
        businessId: args.businessId,
        appointmentId: args.appointmentId,
      });
      if (!loaded || loaded.appointment.status !== "confirmed") {
        return { ok: false, verified: false, reason: "appointment_not_found" };
      }

      if (!phonesMatch(loaded.contact.phone, args.callerPhone)) {
        return { ok: false, verified: false, reason: "phone_mismatch" };
      }

      if (!storedContactNameMatchesIfPresent(loaded.contact.name, args.callerName)) {
        return { ok: false, verified: false, reason: "name_mismatch" };
      }

      if (providedTime && !appointmentTimesMatch(loaded.appointment, providedTime)) {
        return { ok: false, verified: false, reason: "appointment_time_mismatch" };
      }

      if (providedServiceName && !serviceNamesMatch(loaded.service, providedServiceName)) {
        return { ok: false, verified: false, reason: "service_mismatch" };
      }
    } else {
      const { contact, contexts } = await loadConfirmedAppointmentChangeContextsForCaller(
        ctx,
        {
          businessId: args.businessId,
          callerPhone: args.callerPhone,
        },
      );
      if (!contact) {
        return { ok: false, verified: false, reason: "phone_mismatch" };
      }
      if (!storedContactNameMatchesIfPresent(contact.name, args.callerName)) {
        return { ok: false, verified: false, reason: "name_mismatch" };
      }

      const matches = contexts.filter(
        (context) =>
          (!providedTime || appointmentTimesMatch(context.appointment, providedTime)) &&
          (!providedServiceName ||
            substantiveServiceNameFactMatches(context.service, providedServiceName)),
      );
      if (matches.length === 0) {
        return {
          ok: false,
          verified: false,
          reason: providedTime ? "appointment_time_mismatch" : "service_mismatch",
        };
      }
      if (matches.length > 1) {
        return { ok: false, verified: false, reason: "appointment_match_ambiguous" };
      }
      loaded = matches[0] ?? null;
    }

    if (!loaded) {
      return { ok: false, verified: false, reason: "appointment_not_found" };
    }

    const requiresOtp = policy.verificationMode === "otp_required";
    const status: AppointmentChangeVerificationStatus = requiresOtp
      ? "otp_pending"
      : "facts_verified";
    const verificationId = await saveVerificationSession(ctx, {
      businessId: args.businessId,
      appointmentId: loaded.appointment._id,
      contactId: loaded.contact._id,
      ...(args.callId ? { callId: args.callId } : {}),
      ...(args.conversationId ? { conversationId: args.conversationId } : {}),
      channel: args.channel,
      callerPhone: args.callerPhone,
      verificationMode: policy.verificationMode,
      status,
      otpPhone: loaded.contact.phone,
    });

    return {
      ok: true,
      verified: true,
      requiresOtp,
      verificationId,
      appointmentId: loaded.appointment._id,
      contactId: loaded.contact._id,
      status,
    };
  },
});

export const getAppointmentChangeVerification = internalQuery({
  args: {
    verificationId: v.id("appointment_change_verifications"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.verificationId);
  },
});

export const markAppointmentChangeOtpStarted = internalMutation({
  args: {
    verificationId: v.id("appointment_change_verifications"),
    verificationSid: v.string(),
    status: v.string(),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.verificationId, {
      verificationSid: args.verificationSid,
      status: args.status,
      updatedAt: args.updatedAt,
    });
    return null;
  },
});

export const markAppointmentChangeOtpApproved = internalMutation({
  args: {
    verificationId: v.id("appointment_change_verifications"),
    status: v.string(),
    approvedAt: v.string(),
    attemptCount: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.verificationId, {
      status: args.status,
      verifiedAt: args.approvedAt,
      updatedAt: args.approvedAt,
      attemptCount: args.attemptCount,
      lastError: undefined,
    });
    return null;
  },
});

export const updateAppointmentChangeOtpStatus = internalMutation({
  args: {
    verificationId: v.id("appointment_change_verifications"),
    status: v.string(),
    updatedAt: v.string(),
    attemptCount: v.number(),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.verificationId, {
      status: args.status,
      updatedAt: args.updatedAt,
      attemptCount: args.attemptCount,
      ...(args.lastError ? { lastError: args.lastError } : {}),
    });
    return null;
  },
});

export const cancelAppointmentForBusiness = internalMutation({
  args: {
    businessId: v.id("businesses"),
    appointmentId: v.id("appointments"),
    channel: v.string(),
    callerPhone: v.string(),
    finalConfirmation: v.boolean(),
    verificationId: v.optional(v.id("appointment_change_verifications")),
    callId: v.optional(v.id("calls")),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<AppointmentChangeMutationResult> => {
    const policy = await getAppointmentChangePolicy(ctx, args.businessId);
    if (!actionAllowed(policy, "cancel")) {
      return await blockChangeAttempt(ctx, {
        ...args,
        action: "cancel",
        reason: "appointment_changes_not_allowed",
        verificationMode: policy.verificationMode,
      });
    }
    if (!args.finalConfirmation) {
      return await blockChangeAttempt(ctx, {
        ...args,
        action: "cancel",
        reason: "missing_final_confirmation",
        verificationMode: policy.verificationMode,
      });
    }

    const loaded = await loadVerifiedAppointmentContext(ctx, args);
    if (!loaded || loaded.appointment.status !== "confirmed") {
      return { ok: false, action: "cancel", reason: "appointment_not_found" };
    }
    if (!phonesMatch(loaded.contact.phone, args.callerPhone)) {
      return await blockChangeAttempt(ctx, {
        ...args,
        action: "cancel",
        reason: "phone_mismatch",
        verificationMode: policy.verificationMode,
      });
    }

    const verification = await findLatestVerification(ctx, args);
    if (!verification || !verificationSatisfiesPolicy(verification, policy, new Date().toISOString())) {
      return await blockChangeAttempt(ctx, {
        ...args,
        action: "cancel",
        reason: "verification_required",
        verificationMode: policy.verificationMode,
        ...(verification?._id ? { verificationId: verification._id } : {}),
      });
    }

    const calendarSyncState =
      loaded.appointment.calendarExternalEventId ||
      loaded.appointment.calendarSyncState !== "not_required"
        ? "pending"
        : "not_required";
    await ctx.db.patch(loaded.appointment._id, {
      status: "canceled",
      calendarSyncState,
      calendarLastSyncError: undefined,
      calendarReconcileAfter: undefined,
    });
    await ctx.runMutation(internal.notifications.reminders.cancelScheduledNotificationsForAppointment, {
      appointmentId: loaded.appointment._id,
    });
    await recordAppointmentChangeAudit(ctx, {
      appointment: loaded.appointment,
      contactId: loaded.contact._id,
      verificationId: verification._id,
      action: "cancel",
      channel: args.channel,
      callerPhone: args.callerPhone,
      verificationMode: policy.verificationMode,
      status: "succeeded",
      newStatus: "canceled",
      newStartsAt: loaded.appointment.startsAt,
      newEndsAt: loaded.appointment.endsAt,
      newStaffId: loaded.appointment.staffId,
      payload: { finalConfirmation: args.finalConfirmation },
    });

    await workflowManager.start(ctx, internal.ai.workflows.runtime.appointmentCalendarSyncWorkflow, {
      appointmentId: loaded.appointment._id,
    });

    return {
      ok: true,
      action: "cancel",
      appointmentId: loaded.appointment._id,
      serviceId: loaded.appointment.serviceId,
      startsAt: loaded.appointment.startsAt,
      endsAt: loaded.appointment.endsAt,
      status: "canceled",
      calendarSyncState,
    };
  },
});

export const rescheduleAppointmentForBusiness = internalMutation({
  args: {
    businessId: v.id("businesses"),
    appointmentId: v.id("appointments"),
    channel: v.string(),
    callerPhone: v.string(),
    startsAt: v.string(),
    timezone: v.optional(v.string()),
    preferredStaffId: v.optional(v.id("staff")),
    finalConfirmation: v.boolean(),
    verificationId: v.optional(v.id("appointment_change_verifications")),
    callId: v.optional(v.id("calls")),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<AppointmentChangeMutationResult> => {
    const policy = await getAppointmentChangePolicy(ctx, args.businessId);
    if (!actionAllowed(policy, "reschedule")) {
      return await blockChangeAttempt(ctx, {
        ...args,
        action: "reschedule",
        reason: "appointment_changes_not_allowed",
        verificationMode: policy.verificationMode,
      });
    }
    if (!args.finalConfirmation) {
      return await blockChangeAttempt(ctx, {
        ...args,
        action: "reschedule",
        reason: "missing_final_confirmation",
        verificationMode: policy.verificationMode,
      });
    }

    const loaded = await loadVerifiedAppointmentContext(ctx, args);
    if (!loaded || loaded.appointment.status !== "confirmed") {
      return { ok: false, action: "reschedule", reason: "appointment_not_found" };
    }
    if (!phonesMatch(loaded.contact.phone, args.callerPhone)) {
      return await blockChangeAttempt(ctx, {
        ...args,
        action: "reschedule",
        reason: "phone_mismatch",
        verificationMode: policy.verificationMode,
      });
    }

    const verification = await findLatestVerification(ctx, args);
    if (!verification || !verificationSatisfiesPolicy(verification, policy, new Date().toISOString())) {
      return await blockChangeAttempt(ctx, {
        ...args,
        action: "reschedule",
        reason: "verification_required",
        verificationMode: policy.verificationMode,
        ...(verification?._id ? { verificationId: verification._id } : {}),
      });
    }

    const availability: Array<{
      staffId: string;
      serviceId: string;
      startsAt: string;
      endsAt: string;
    }> = await ctx.runQuery(internal.appointments.booking.checkAvailabilityForBusiness, {
      businessId: args.businessId,
      serviceId: loaded.appointment.serviceId,
      startsAt: args.startsAt,
      timezone: args.timezone ?? loaded.appointment.timezone,
      ...(args.preferredStaffId !== undefined
        ? { preferredStaffId: args.preferredStaffId }
        : {}),
      excludeAppointmentId: loaded.appointment._id,
    });
    const selected = availability[0];
    if (!selected) {
      return await blockChangeAttempt(ctx, {
        ...args,
        action: "reschedule",
        reason: "no_availability",
        verificationMode: policy.verificationMode,
        verificationId: verification._id,
      });
    }

    const calendarSyncState =
      loaded.appointment.calendarExternalEventId ||
      loaded.appointment.calendarSyncState !== "not_required"
        ? "pending"
        : "not_required";
    await ctx.db.patch(loaded.appointment._id, {
      startsAt: selected.startsAt,
      endsAt: selected.endsAt,
      staffId: selected.staffId as Id<"staff">,
      timezone: args.timezone ?? loaded.appointment.timezone,
      status: "confirmed",
      calendarSyncState,
      calendarLastSyncError: undefined,
      calendarReconcileAfter: undefined,
    });
    await ctx.runMutation(internal.notifications.reminders.cancelScheduledNotificationsForAppointment, {
      appointmentId: loaded.appointment._id,
    });
    await workflowManager.start(ctx, internal.ai.workflows.runtime.afterAppointmentBookedWorkflow, {
      appointmentId: loaded.appointment._id,
    });
    await workflowManager.start(ctx, internal.ai.workflows.runtime.appointmentCalendarSyncWorkflow, {
      appointmentId: loaded.appointment._id,
    });

    if (args.conversationId) {
      await ctx.runMutation(internal.ai.agents.runtime.saveConversationBookingState, {
        businessId: args.businessId,
        conversationId: args.conversationId,
        mode: "booked",
        selectedServiceId: loaded.appointment.serviceId,
        lastConfirmedAppointmentId: loaded.appointment._id,
        lastConfirmedServiceId: loaded.appointment.serviceId,
        lastConfirmedStartsAt: selected.startsAt,
        lastOfferedStartsAt: [],
        pendingConfirmationAppointmentId: loaded.appointment._id,
      });
    }

    await recordAppointmentChangeAudit(ctx, {
      appointment: loaded.appointment,
      contactId: loaded.contact._id,
      verificationId: verification._id,
      action: "reschedule",
      channel: args.channel,
      callerPhone: args.callerPhone,
      verificationMode: policy.verificationMode,
      status: "succeeded",
      newStatus: "confirmed",
      newStartsAt: selected.startsAt,
      newEndsAt: selected.endsAt,
      newStaffId: selected.staffId as Id<"staff">,
      payload: { finalConfirmation: args.finalConfirmation },
    });

    return {
      ok: true,
      action: "reschedule",
      appointmentId: loaded.appointment._id,
      serviceId: loaded.appointment.serviceId,
      startsAt: selected.startsAt,
      endsAt: selected.endsAt,
      status: "confirmed",
      calendarSyncState,
    };
  },
});
