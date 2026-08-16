import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { businesses, enqueueOutbox, receptionistProfiles } from "@lobbystack/db";
import { asApiResponse, readJson, withOperatorTransaction } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

const profileFields = [
  "greeting",
  "tone",
  "summary",
  "bookingPolicy",
  "voiceInstructions",
  "smsInstructions",
  "transferMode",
  "transferNumber",
] as const;

type ProfileField = (typeof profileFields)[number];
type ProfilePatch = Partial<Record<"greeting" | "tone" | "summary" | "bookingPolicy" | "transferMode", string>> &
  Partial<Record<"voiceInstructions" | "smsInstructions" | "transferNumber", string | null>>;

function optionalText(value: unknown, field: string, maxLength: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${field} must be a string.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw new Error(`${field} is invalid.`);
  return normalized;
}

function readProfilePatch(body: Record<string, unknown>): ProfilePatch {
  const patch: Partial<Record<ProfileField, string | null | undefined>> = {};
  for (const field of profileFields) {
    if (!(field in body)) continue;
    const maxLength = field === "voiceInstructions" || field === "smsInstructions" ? 8_000 : 2_000;
    const value = optionalText(body[field], field, maxLength);
    if (value === null && !["voiceInstructions", "smsInstructions", "transferNumber"].includes(field)) {
      throw new Error(`${field} cannot be empty.`);
    }
    if (value !== undefined) patch[field] = value;
  }

  if (patch.transferMode !== undefined && !["always", "on_request", "on_urgent"].includes(patch.transferMode ?? "")) {
    throw new Error("transferMode is invalid.");
  }
  return patch as ProfilePatch;
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
        throw new Error("A profile object is required.");
      }
      const patch = readProfilePatch(body as Record<string, unknown>);
      const locale = (body as Record<string, unknown>).locale;
      if (locale !== undefined && locale !== "en" && locale !== "fr") throw new Error("locale is invalid.");
      if (Object.keys(patch).length === 0) {
        throw new Error("At least one profile field is required.");
      }

      const business = (await tx.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId)).limit(1))[0];
      if (!business) throw new Error("Business not found.");

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
        transferMode: patch.transferMode ?? "on_request",
        ...(patch.transferNumber !== undefined ? { transferNumber: patch.transferNumber } : {}),
      }).onConflictDoUpdate({
        target: receptionistProfiles.businessId,
        set: { ...patch, updatedAt: new Date() },
      }).returning();

      if (!profile) throw new Error("Receptionist profile could not be saved.");
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
