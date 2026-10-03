import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { businesses, businessHours, receptionistProfiles, type DatabaseTransaction } from "@lobbystack/db";
import { replaceBusinessHoursInTransaction } from "@lobbystack/domain";
import { normalizeBookingMode } from "@lobbystack/shared";
import { asApiResponse, jsonError, readJson, withOperatorTransaction } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

// The weekly opening hours editor. hoursSource says who set them: nobody yet,
// AI from the knowledge sources, or a person. Saving here makes them the
// operator's, so AI never replaces them.

async function loadHours(tx: DatabaseTransaction, businessId: string) {
  const [business, hours, profile] = await Promise.all([
    tx.select({ timezone: businesses.timezone, hoursSource: businesses.hoursSource }).from(businesses).where(eq(businesses.id, businessId)).limit(1),
    tx.select({ dayOfWeek: businessHours.dayOfWeek, openMinutes: businessHours.openMinutes, closeMinutes: businessHours.closeMinutes }).from(businessHours).where(eq(businessHours.businessId, businessId)).orderBy(asc(businessHours.dayOfWeek), asc(businessHours.openMinutes)),
    tx.select({ bookingMode: receptionistProfiles.bookingMode }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, businessId)).limit(1),
  ]);
  if (!business[0]) throw jsonError("Business not found.", 404);
  return { timezone: business[0].timezone, hoursSource: business[0].hoursSource, bookingMode: normalizeBookingMode(profile[0]?.bookingMode), hours };
}

function readHours(body: unknown): Array<{ dayOfWeek: number; openMinutes: number; closeMinutes: number }> {
  const hours = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>).hours : undefined;
  if (!Array.isArray(hours) || hours.length > 28) throw jsonError("hours must be a list of up to 28 opening windows.");
  return hours.map((window) => {
    const value = typeof window === "object" && window !== null ? window as Record<string, unknown> : {};
    if (![value.dayOfWeek, value.openMinutes, value.closeMinutes].every((field) => typeof field === "number")) throw jsonError("Each opening window needs dayOfWeek, openMinutes and closeMinutes.");
    return { dayOfWeek: value.dayOfWeek as number, openMinutes: value.openMinutes as number, closeMinutes: value.closeMinutes as number };
  });
}

export async function GET(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => await loadHours(tx, businessId)));
  } catch (error) {
    return asApiResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const hours = readHours(await readJson(request));
      try {
        await replaceBusinessHoursInTransaction(tx, { businessId, hours });
      } catch (error) {
        throw jsonError(error instanceof Error ? error.message : "The opening hours are invalid.");
      }
      return await loadHours(tx, businessId);
    }, { minimumRole: "business_admin" }));
  } catch (error) {
    return asApiResponse(error);
  }
}
