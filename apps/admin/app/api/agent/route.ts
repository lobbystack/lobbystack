import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { businesses, enqueueOutbox, receptionistProfiles } from "@lobbystack/db";
import { defaultAppointmentChangePolicy, type AppointmentChangePolicy } from "@lobbystack/shared";
import { asApiResponse, jsonError, readJson, withOperatorTransaction } from "@/lib/api-helpers";

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
  { appointmentChangePolicy?: AppointmentChangePolicy };

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
  return { ...patch, ...(policy !== undefined ? { appointmentChangePolicy: policy } : {}) } as ProfilePatch;
}

export async function GET(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const [business, profile] = await Promise.all([
        tx.select({ id: businesses.id, name: businesses.name, timezone: businesses.timezone, defaultLocale: businesses.defaultLocale }).from(businesses).where(eq(businesses.id, businessId)).limit(1),
        tx.select().from(receptionistProfiles).where(eq(receptionistProfiles.businessId, businessId)).limit(1),
      ]);
      return { business: business[0] ?? null, profile: profile[0] ?? null };
    }));
  } catch (error) {
    return asApiResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const body = await readJson(request);
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        throw jsonError("A profile object is required.");
      }
      const patch = readProfilePatch(body as Record<string, unknown>);
      const locale = (body as Record<string, unknown>).locale;
      if (locale !== undefined && locale !== "en" && locale !== "fr") throw jsonError("locale is invalid.");
      if (Object.keys(patch).length === 0 && locale === undefined) {
        throw jsonError("At least one profile field is required.");
      }

      const business = (await tx.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId)).limit(1))[0];
      if (!business) throw jsonError("Business not found.", 404);

      if (locale !== undefined) {
        await tx.update(businesses).set({ defaultLocale: locale, updatedAt: new Date() }).where(eq(businesses.id, businessId));
      }

      const [profile] = await tx.insert(receptionistProfiles).values({
        businessId,
        greeting: patch.greeting ?? `Thank you for calling ${business.name}.`,
        tone: patch.tone ?? "professional",
        summary: patch.summary ?? business.name,
        bookingPolicy: patch.bookingPolicy ?? "Confirm availability before booking.",
        ...(patch.voiceInstructions !== undefined ? { voiceInstructions: patch.voiceInstructions } : {}),
        ...(patch.smsInstructions !== undefined ? { smsInstructions: patch.smsInstructions } : {}),
        ...(patch.chatInstructions !== undefined ? { chatInstructions: patch.chatInstructions } : {}),
        transferMode: patch.transferMode ?? "on_request",
        ...(patch.transferNumber !== undefined ? { transferNumber: patch.transferNumber } : {}),
        appointmentChangePolicy: patch.appointmentChangePolicy ?? defaultAppointmentChangePolicy,
      }).onConflictDoUpdate({
        target: receptionistProfiles.businessId,
        set: { ...patch, updatedAt: new Date() },
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
      return { profile };
    }, { minimumRole: "business_admin" }));
  } catch (error) {
    return asApiResponse(error);
  }
}
