import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { businesses, enqueueOutbox } from "@lobbystack/db";
import { receptionistPatchValues, resolveReceptionist, updateReceptionistInTransaction, type ReceptionistPatch } from "@lobbystack/domain";
import type { AppointmentChangePolicy, BookingMode } from "@lobbystack/shared";
import { asApiResponse, jsonError, readJson, withOperatorTransaction } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

// Receptionist settings. `?agentId=` picks a receptionist; without it this
// reads and writes the business's default receptionist, which is what the
// single-receptionist settings screens have always edited.

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requestedAgentId(request: Request): string | undefined {
  const value = new URL(request.url).searchParams.get("agentId")?.trim();
  if (!value) return undefined;
  if (!UUID.test(value)) throw jsonError("agentId is invalid.");
  return value;
}

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

function readProfilePatch(body: Record<string, unknown>): ReceptionistPatch {
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
  const name = body.name === undefined ? undefined : optionalText(body.name, "name", 80);
  if (name === null) throw jsonError("name cannot be empty.");
  const voice = body.voice === undefined ? undefined : optionalText(body.voice, "voice", 32);
  const language = body.receptionistLanguage;
  if (language !== undefined && language !== null && language !== "en" && language !== "fr") throw jsonError("receptionistLanguage is invalid.");
  return {
    ...patch,
    ...(name !== undefined ? { name } : {}),
    ...(voice !== undefined ? { voice } : {}),
    ...(language !== undefined ? { language: language as "en" | "fr" | null } : {}),
    ...(policy !== undefined ? { appointmentChangePolicy: policy } : {}),
    ...(bookingMode !== undefined ? { bookingMode: bookingMode as BookingMode } : {}),
  } as ReceptionistPatch;
}

export async function GET(request: Request) {
  try {
    const agentId = requestedAgentId(request);
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const [business, profile] = await Promise.all([
        tx.select({ id: businesses.id, name: businesses.name, timezone: businesses.timezone, defaultLocale: businesses.defaultLocale }).from(businesses).where(eq(businesses.id, businessId)).limit(1),
        resolveReceptionist(tx, businessId, agentId),
      ]);
      if (agentId && profile.id !== agentId) throw jsonError("Receptionist not found.", 404, "receptionist_not_found");
      return { business: business[0] ?? null, profile };
    }));
  } catch (error) {
    return asApiResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const agentId = requestedAgentId(request);
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const body = await readJson(request);
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        throw jsonError("A profile object is required.");
      }
      const values = receptionistPatchValues(readProfilePatch(body as Record<string, unknown>));
      const locale = (body as Record<string, unknown>).locale;
      if (locale !== undefined && locale !== "en" && locale !== "fr") throw jsonError("locale is invalid.");
      if (Object.keys(values).length === 0 && locale === undefined) {
        throw jsonError("At least one profile field is required.");
      }

      const business = (await tx.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId)).limit(1))[0];
      if (!business) throw jsonError("Business not found.", 404);

      if (locale !== undefined) {
        await tx.update(businesses).set({ defaultLocale: locale, updatedAt: new Date() }).where(eq(businesses.id, businessId));
        if (Object.keys(values).length === 0) {
          await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId, aggregateType: "business", aggregateId: businessId, dedupeKey: `snapshot:${businessId}:locale:${Date.now()}`, payload: { businessId, reason: "locale_updated" } });
        }
      }

      const profile = Object.keys(values).length > 0
        ? await updateReceptionistInTransaction(tx, { businessId, ...(agentId ? { agentId } : {}), values })
        : await resolveReceptionist(tx, businessId, agentId);
      return { profile };
    }, { minimumRole: "business_admin" }));
  } catch (error) {
    return asApiResponse(error);
  }
}
