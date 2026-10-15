import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { trialTransferNumberInTransaction, updateBusinessInTransaction } from "@lobbystack/domain";
import { businesses, enqueueOutbox, knowledgeDocuments, knowledgeSnippets, receptionistProfiles } from "@lobbystack/db";
import { defaultAppointmentChangePolicy, defaultGreeting, isCurrencyCode, isRuntimeLocale, normalizeRuntimeLocale, type AppointmentChangePolicy, type BookingMode } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

const profileFields = [
  "greeting",
  "tone",
  "summary",
  "bookingPolicy",
  "voiceInstructions",
  "smsInstructions",
  "chatInstructions",
  "transferMode",
  "transferNumber",
] as const;

type ProfileField = (typeof profileFields)[number];
type ProfilePatch = Partial<Record<"greeting" | "tone" | "summary" | "bookingPolicy" | "transferMode", string>> &
  Partial<Record<"voiceInstructions" | "smsInstructions" | "chatInstructions" | "transferNumber", string | null>> &
  { appointmentChangePolicy?: AppointmentChangePolicy; bookingMode?: BookingMode };

function appointmentPolicy(value: unknown): AppointmentChangePolicy | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw jsonError("appointmentChangePolicy is invalid.");
  const policy = value as Record<string, unknown>;
  if (typeof policy.enabled !== "boolean" || typeof policy.allowCancel !== "boolean" || typeof policy.allowReschedule !== "boolean" || !["phone_match_and_facts", "otp_required", "operator_only"].includes(String(policy.verificationMode))) throw jsonError("appointmentChangePolicy is invalid.");
  return { enabled: policy.enabled, allowCancel: policy.allowCancel, allowReschedule: policy.allowReschedule, verificationMode: policy.verificationMode as AppointmentChangePolicy["verificationMode"] };
}

function optionalText(value: unknown, field: string, maxLength: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw jsonError(`${field} must be a string.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw jsonError(`${field} is invalid.`);
  return normalized;
}

function readProfilePatch(body: Record<string, unknown>): ProfilePatch {
  const patch: Partial<Record<ProfileField, string | null | undefined>> = {};
  for (const field of profileFields) {
    if (!(field in body)) continue;
    const maxLength = field === "voiceInstructions" || field === "smsInstructions" || field === "chatInstructions" ? 8_000 : 2_000;
    const value = optionalText(body[field], field, maxLength);
    if (value === null && !["voiceInstructions", "smsInstructions", "chatInstructions", "transferNumber"].includes(field)) {
      throw jsonError(`${field} cannot be empty.`);
    }
    if (value !== undefined) patch[field] = value;
  }

  if (patch.transferMode !== undefined && !["never", "always", "on_request", "on_urgent", "during_business_hours"].includes(patch.transferMode ?? "")) {
    throw jsonError("transferMode is invalid.");
  }
  const policy = appointmentPolicy(body.appointmentChangePolicy);
  const bookingMode = body.bookingMode;
  if (bookingMode !== undefined && bookingMode !== "off" && bookingMode !== "request" && bookingMode !== "instant") throw jsonError("bookingMode is invalid.");
  return { ...patch, ...(policy !== undefined ? { appointmentChangePolicy: policy } : {}), ...(bookingMode !== undefined ? { bookingMode } : {}) } as ProfilePatch;
}

export const GET = operatorRoute(async ({ businessId, transaction }) => NextResponse.json(await transaction(async (tx) => {
  const [business, profile, snippet, document] = await Promise.all([
    tx.select({ id: businesses.id, name: businesses.name, timezone: businesses.timezone, defaultLocale: businesses.defaultLocale, currency: businesses.currency }).from(businesses).where(eq(businesses.id, businessId)).limit(1),
    tx.select().from(receptionistProfiles).where(eq(receptionistProfiles.businessId, businessId)).limit(1),
    tx.select({ id: knowledgeSnippets.id }).from(knowledgeSnippets).where(and(eq(knowledgeSnippets.businessId, businessId), eq(knowledgeSnippets.active, true))).limit(1),
    tx.select({ id: knowledgeDocuments.id }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.businessId, businessId), eq(knowledgeDocuments.active, true), eq(knowledgeDocuments.status, "indexed"))).limit(1),
  ]);
  // The same sources the summary rewrite reads; without any, "Rewrite with AI" has nothing to go on.
  return { business: business[0] ?? null, profile: profile[0] ?? null, hasKnowledgeSources: snippet.length > 0 || document.length > 0 };
})));

export const PATCH = operatorRoute(async ({ businessId, body, transaction }) => NextResponse.json(await transaction(async (tx) => {
  const patch = readProfilePatch(body);
  const { locale } = body;
  if (locale !== undefined && !isRuntimeLocale(locale)) throw jsonError("locale is invalid.");
  const { timezone } = body;
  if (timezone !== undefined && typeof timezone !== "string") throw jsonError("timezone must be a string.");
  const { currency } = body;
  if (currency !== undefined && !isCurrencyCode(currency)) throw jsonError("currency is invalid.");
  // Hands the summary back to AI, which rewrites it from the knowledge sources.
  const { regenerateSummary } = body;
  if (regenerateSummary !== undefined && regenerateSummary !== true) throw jsonError("regenerateSummary must be true.");
  if (regenerateSummary && patch.summary !== undefined) throw jsonError("Send summary or regenerateSummary, not both.");
  if (Object.keys(patch).length === 0 && locale === undefined && timezone === undefined && currency === undefined && !regenerateSummary) {
    throw jsonError("At least one profile field is required.");
  }

  const business = (await tx.select({ name: businesses.name, defaultLocale: businesses.defaultLocale }).from(businesses).where(eq(businesses.id, businessId)).limit(1))[0];
  if (!business) throw jsonError("Business not found.", 404);
  if (patch.transferNumber) {
    // During a free trial, calls transfer only to the owner's verified phone.
    const trialPhone = await trialTransferNumberInTransaction(tx, { businessId });
    if (trialPhone && patch.transferNumber.trim() !== trialPhone) throw jsonError("During your free trial, calls can only transfer to the mobile number you verified.", 409, "trial_transfer_locked");
  }
  const previousLocale = normalizeRuntimeLocale(business.defaultLocale);

  // Opening hours keep their clock times in a new zone; booked appointments keep theirs.
  if (locale !== undefined || timezone !== undefined || currency !== undefined) {
    await updateBusinessInTransaction(tx, { businessId, ...(locale !== undefined ? { defaultLocale: locale } : {}), ...(timezone !== undefined ? { timezone } : {}), ...(currency !== undefined ? { currency } : {}) });
  }

  const [profile] = await tx.insert(receptionistProfiles).values({
    businessId,
    greeting: patch.greeting ?? defaultGreeting(business.name, locale ?? previousLocale),
    tone: patch.tone ?? "professional",
    summary: patch.summary ?? business.name,
    // A summary a person writes is never replaced by AI.
    summarySource: patch.summary !== undefined ? "operator" : "placeholder",
    bookingPolicy: patch.bookingPolicy ?? "Confirm availability before booking.",
    ...(patch.voiceInstructions !== undefined ? { voiceInstructions: patch.voiceInstructions } : {}),
    ...(patch.smsInstructions !== undefined ? { smsInstructions: patch.smsInstructions } : {}),
    ...(patch.chatInstructions !== undefined ? { chatInstructions: patch.chatInstructions } : {}),
    transferMode: patch.transferMode ?? "on_request",
    ...(patch.transferNumber !== undefined ? { transferNumber: patch.transferNumber } : {}),
    appointmentChangePolicy: patch.appointmentChangePolicy ?? defaultAppointmentChangePolicy,
    ...(patch.bookingMode !== undefined ? { bookingMode: patch.bookingMode } : {}),
  }).onConflictDoUpdate({
    target: receptionistProfiles.businessId,
    set: { ...patch, ...(patch.summary !== undefined ? { summarySource: "operator" as const, summaryRegenerateStatus: null } : {}), ...(regenerateSummary ? { summarySource: "generated" as const, summaryRegenerateStatus: "pending" as const } : {}), updatedAt: new Date() },
  }).returning();

  if (!profile) throw jsonError("Receptionist profile could not be saved.", 500);
  await enqueueOutbox(tx, {
    topic: "snapshot.refresh",
    businessId,
    aggregateType: "receptionist_profile",
    aggregateId: profile.id,
    dedupeKey: `snapshot:${businessId}:profile:${profile.updatedAt.toISOString()}`,
    payload: { businessId },
  });
  if (regenerateSummary) {
    await enqueueOutbox(tx, {
      topic: "business.generateSummary",
      businessId,
      aggregateType: "business",
      aggregateId: businessId,
      dedupeKey: `business-summary:${businessId}:regenerate:${Date.now()}`,
      payload: { businessId, reason: "operator_regenerate", force: true },
    });
  }
  return { profile };
}, { minimumRole: "business_admin" })));
