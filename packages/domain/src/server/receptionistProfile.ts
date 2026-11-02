
import { enqueueOutbox, receptionistProfiles, type DatabaseTransaction } from "@lobbystack/db";
import {
  appointmentChangeVerificationModes,
  bookingModes,
  defaultAppointmentChangePolicy,
  DEFAULT_RECEPTIONIST_VOICE,
  DEFAULT_STAFF_FIRST_RING_SECONDS,
  defaultGreeting,
  isCurrencyCode,
  isReceptionistVoice,
  isRuntimeLocale,
  RECEPTIONIST_INSTRUCTIONS_MAX_LENGTH,
  RECEPTIONIST_TEXT_MAX_LENGTH,
  STAFF_FIRST_MESSAGE_MAX_LENGTH,
  staffFirstModes,
  staffFirstRingSeconds,
  transferModes,
  type AppointmentChangePolicy,
  type BookingMode,
  type ReceptionistVoice,
  type RuntimeLocale,
  type StaffFirstMode,
  type TransferPolicy,
} from "@lobbystack/shared";

import { assertTransferNumberAllowed, enqueueRefusedCallForwardRefresh } from "./numberTrials";
import { assertStaffFirstChange, enqueueStaffFirstRouting } from "./staffFirst";

// Receptionist settings. The dashboard and the v1 API check and save them
// here, so both follow one set of rules.

/** Fields a change can set. A missing field stays as it is; null clears an optional one. */
export type ReceptionistProfilePatch = {
  greeting?: string;
  tone?: string;
  summary?: string;
  bookingPolicy?: string;
  voiceInstructions?: string | null;
  smsInstructions?: string | null;
  chatInstructions?: string | null;
  transferMode?: TransferPolicy["mode"];
  transferNumber?: string | null;
  appointmentChangePolicy?: AppointmentChangePolicy;
  bookingMode?: BookingMode;
  voice?: ReceptionistVoice;
  staffFirstMode?: StaffFirstMode;
  staffFirstNumber?: string | null;
  staffFirstRingSeconds?: number;
  staffFirstMessage?: string | null;
  staffFirstHandoverMessage?: string | null;
};

export type ReceptionistSettingsChange = {
  patch: ReceptionistProfilePatch;
  locale?: RuntimeLocale;
  /** The language the team reads the receptionist's notes in. Null goes back to following `locale`. */
  teamLocale?: RuntimeLocale | null;
  timezone?: string;
  currency?: string;
  /** Hands the summary back to AI, which rewrites it from the knowledge sources. */
  regenerateSummary: boolean;
};

const profileFields = ["greeting", "tone", "summary", "bookingPolicy", "voiceInstructions", "smsInstructions", "chatInstructions", "transferMode", "transferNumber", "staffFirstMode", "staffFirstNumber", "staffFirstMessage", "staffFirstHandoverMessage"] as const;
type ProfileField = (typeof profileFields)[number];
const instructionFields: readonly ProfileField[] = ["voiceInstructions", "smsInstructions", "chatInstructions"];
const staffFirstMessageFields: readonly ProfileField[] = ["staffFirstMessage", "staffFirstHandoverMessage"];
const clearableFields: readonly ProfileField[] = [...instructionFields, ...staffFirstMessageFields, "transferNumber", "staffFirstNumber"];

function invalid(message: string): Error {
  return Object.assign(new Error(message), { status: 400 });
}

function optionalText(value: unknown, field: string, maxLength: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw invalid(`${field} must be a string.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw invalid(`${field} is invalid.`);
  return normalized;
}

function appointmentPolicy(value: unknown): AppointmentChangePolicy | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid("appointmentChangePolicy is invalid.");
  const policy = value as Record<string, unknown>;
  if (typeof policy.enabled !== "boolean" || typeof policy.allowCancel !== "boolean" || typeof policy.allowReschedule !== "boolean" || !(appointmentChangeVerificationModes as readonly string[]).includes(String(policy.verificationMode))) throw invalid("appointmentChangePolicy is invalid.");
  return { enabled: policy.enabled, allowCancel: policy.allowCancel, allowReschedule: policy.allowReschedule, verificationMode: policy.verificationMode as AppointmentChangePolicy["verificationMode"] };
}

/**
 * Reads the dashboard's receptionist settings body: profile fields in
 * camelCase plus locale, timezone, currency and regenerateSummary. Throws a
 * 400 error that names the first field that is wrong.
 */
export function readReceptionistSettingsChange(body: unknown): ReceptionistSettingsChange {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw invalid("A profile object is required.");
  const input = body as Record<string, unknown>;
  const fields: Partial<Record<ProfileField, string | null>> = {};
  for (const field of profileFields) {
    if (!(field in input)) continue;
    const maxLength = staffFirstMessageFields.includes(field) ? STAFF_FIRST_MESSAGE_MAX_LENGTH : instructionFields.includes(field) ? RECEPTIONIST_INSTRUCTIONS_MAX_LENGTH : RECEPTIONIST_TEXT_MAX_LENGTH;
    const value = optionalText(input[field], field, maxLength);
    if (value === null && !clearableFields.includes(field)) throw invalid(`${field} cannot be empty.`);
    if (value !== undefined) fields[field] = value;
  }
  if (fields.transferMode !== undefined && !(transferModes as readonly string[]).includes(fields.transferMode ?? "")) throw invalid("transferMode is invalid.");
  if (fields.staffFirstMode !== undefined && !(staffFirstModes as readonly string[]).includes(fields.staffFirstMode ?? "")) throw invalid("staffFirstMode is invalid.");
  const ringSeconds = input.staffFirstRingSeconds;
  if (ringSeconds !== undefined && !(staffFirstRingSeconds as readonly unknown[]).includes(ringSeconds)) throw invalid("staffFirstRingSeconds is invalid.");
  const policy = appointmentPolicy(input.appointmentChangePolicy);
  const bookingMode = input.bookingMode;
  if (bookingMode !== undefined && !(bookingModes as readonly unknown[]).includes(bookingMode)) throw invalid("bookingMode is invalid.");
  const voice = input.voice;
  if (voice !== undefined && !isReceptionistVoice(voice)) throw invalid("voice is invalid.");
  const patch = { ...fields, ...(policy !== undefined ? { appointmentChangePolicy: policy } : {}), ...(bookingMode !== undefined ? { bookingMode } : {}), ...(voice !== undefined ? { voice } : {}), ...(ringSeconds !== undefined ? { staffFirstRingSeconds: ringSeconds } : {}) } as ReceptionistProfilePatch;

  const { locale, teamLocale, timezone, currency, regenerateSummary } = input;
  if (locale !== undefined && !isRuntimeLocale(locale)) throw invalid("locale is invalid.");
  if (teamLocale !== undefined && teamLocale !== null && !isRuntimeLocale(teamLocale)) throw invalid("teamLocale is invalid.");
  if (timezone !== undefined && typeof timezone !== "string") throw invalid("timezone must be a string.");
  if (currency !== undefined && !isCurrencyCode(currency)) throw invalid("currency is invalid.");
  if (regenerateSummary !== undefined && regenerateSummary !== true) throw invalid("regenerateSummary must be true.");
  if (regenerateSummary && patch.summary !== undefined) throw invalid("Send summary or regenerateSummary, not both.");
  if (Object.keys(patch).length === 0 && locale === undefined && teamLocale === undefined && timezone === undefined && currency === undefined && !regenerateSummary) throw invalid("At least one profile field is required.");
  return { patch, ...(locale !== undefined ? { locale } : {}), ...(teamLocale !== undefined ? { teamLocale } : {}), ...(timezone !== undefined ? { timezone } : {}), ...(currency !== undefined ? { currency } : {}), regenerateSummary: regenerateSummary === true };
}

/** The settings a receptionist has before anyone edits them. */
export function defaultReceptionistProfile(businessName: string, locale: RuntimeLocale = "en") {
  return {
    greeting: defaultGreeting(businessName, locale),
    tone: "professional",
    summary: businessName,
    summarySource: "placeholder" as const,
    bookingPolicy: "Confirm availability before booking.",
    voiceInstructions: null,
    smsInstructions: null,
    chatInstructions: null,
    transferMode: "on_request" as const,
    transferNumber: null,
    appointmentChangePolicy: defaultAppointmentChangePolicy,
    bookingMode: "instant" as const,
    voice: DEFAULT_RECEPTIONIST_VOICE,
    staffFirstMode: "never" as const,
    staffFirstNumber: null,
    staffFirstRingSeconds: DEFAULT_STAFF_FIRST_RING_SECONDS,
    staffFirstMessage: null,
    staffFirstHandoverMessage: null,
  };
}

/**
 * Saves the fields given, creating the profile from the defaults (greeting in
 * locale) when the business has none, and refreshes the snapshot calls read
 * the receptionist from. A transfer number must pass the same country and
 * free-trial checks as the dashboard's. A summary someone writes is never
 * replaced by AI; regenerateSummary hands it back to AI and queues the
 * rewrite. Callers authorize and check the fields first. Null when nothing
 * was saved.
 */
export async function saveReceptionistProfileInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; businessName: string; locale?: RuntimeLocale | undefined; patch: ReceptionistProfilePatch; regenerateSummary?: boolean | undefined },
): Promise<typeof receptionistProfiles.$inferSelect | null> {
  const { businessId, patch } = input;
  // An E.164 number in a country Twilio can call and, during a free trial, only the mobile its claimer verified. Employees' numbers follow the same rules.
  if (patch.transferNumber) await assertTransferNumberAllowed(tx, { businessId, phone: patch.transferNumber });
  const changesStaffFirst = patch.staffFirstMode !== undefined || patch.staffFirstNumber !== undefined;
  if (changesStaffFirst) await assertStaffFirstChange(tx, { businessId, mode: patch.staffFirstMode, number: patch.staffFirstNumber });
  const defaults = defaultReceptionistProfile(input.businessName, input.locale);
  const [profile] = await tx.insert(receptionistProfiles).values({
    businessId,
    greeting: patch.greeting ?? defaults.greeting,
    tone: patch.tone ?? defaults.tone,
    summary: patch.summary ?? defaults.summary,
    // A summary a person writes is never replaced by AI.
    summarySource: patch.summary !== undefined ? "operator" : "placeholder",
    bookingPolicy: patch.bookingPolicy ?? defaults.bookingPolicy,
    ...(patch.voiceInstructions !== undefined ? { voiceInstructions: patch.voiceInstructions } : {}),
    ...(patch.smsInstructions !== undefined ? { smsInstructions: patch.smsInstructions } : {}),
    ...(patch.chatInstructions !== undefined ? { chatInstructions: patch.chatInstructions } : {}),
    transferMode: patch.transferMode ?? defaults.transferMode,
    ...(patch.transferNumber !== undefined ? { transferNumber: patch.transferNumber } : {}),
    appointmentChangePolicy: patch.appointmentChangePolicy ?? defaults.appointmentChangePolicy,
    ...(patch.bookingMode !== undefined ? { bookingMode: patch.bookingMode } : {}),
    ...(patch.voice !== undefined ? { voice: patch.voice } : {}),
    ...(patch.staffFirstMode !== undefined ? { staffFirstMode: patch.staffFirstMode } : {}),
    ...(patch.staffFirstNumber !== undefined ? { staffFirstNumber: patch.staffFirstNumber } : {}),
    ...(patch.staffFirstRingSeconds !== undefined ? { staffFirstRingSeconds: patch.staffFirstRingSeconds } : {}),
    ...(patch.staffFirstMessage !== undefined ? { staffFirstMessage: patch.staffFirstMessage } : {}),
    ...(patch.staffFirstHandoverMessage !== undefined ? { staffFirstHandoverMessage: patch.staffFirstHandoverMessage } : {}),
  }).onConflictDoUpdate({
    target: receptionistProfiles.businessId,
    set: { ...patch, ...(patch.summary !== undefined ? { summarySource: "operator" as const, summaryRegenerateStatus: null } : {}), ...(input.regenerateSummary ? { summarySource: "generated" as const, summaryRegenerateStatus: "pending" as const } : {}), updatedAt: new Date() },
  }).returning();
  if (!profile) return null;
  // Some carriers forward a call the receptionist refuses to a number stored on the carrier, so they learn the new transfer number.
  if (patch.transferNumber !== undefined) await enqueueRefusedCallForwardRefresh(tx, businessId);
  if (patch.staffFirstMode !== undefined) await enqueueStaffFirstRouting(tx, businessId);
  await enqueueOutbox(tx, {
    topic: "snapshot.refresh",
    businessId,
    aggregateType: "receptionist_profile",
    aggregateId: profile.id,
    dedupeKey: `snapshot:${businessId}:profile:${profile.updatedAt.toISOString()}`,
    payload: { businessId },
  });
  if (input.regenerateSummary) {
    await enqueueOutbox(tx, {
      topic: "business.generateSummary",
      businessId,
      aggregateType: "business",
      aggregateId: businessId,
      dedupeKey: `business-summary:${businessId}:regenerate:${Date.now()}`,
      payload: { businessId, reason: "operator_regenerate", force: true },
    });
  }
  return profile;
}
