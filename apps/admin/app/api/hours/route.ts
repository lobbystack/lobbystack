import { and, asc, eq, gt } from "drizzle-orm";
import { DateTime } from "luxon";
import { NextResponse } from "next/server";

import { businesses, businessHours, closures, receptionistProfiles, type DatabaseTransaction } from "@lobbystack/db";
import { replaceBusinessHoursInTransaction } from "@lobbystack/domain";
import { normalizeBookingMode } from "@lobbystack/shared";
import { asApiResponse, jsonError, readJson, withOperatorTransaction } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

// The weekly opening hours editor. hoursSource says who set them: nobody yet,
// AI from the knowledge sources, or a person. Saving here makes them the
// operator's, so AI never replaces them. It also edits dated closures, such as
// Christmas Day, as local times in the business's timezone (2026-12-25T00:00);
// closures that already ended aren't listed, and the next save drops them.

const localDateTime = (instant: Date, timezone: string) => DateTime.fromJSDate(instant, { zone: timezone }).toFormat("yyyy-MM-dd'T'HH:mm");

async function loadHours(tx: DatabaseTransaction, businessId: string) {
  const [business, hours, profile, closureRows] = await Promise.all([
    tx.select({ timezone: businesses.timezone, hoursSource: businesses.hoursSource }).from(businesses).where(eq(businesses.id, businessId)).limit(1),
    tx.select({ dayOfWeek: businessHours.dayOfWeek, openMinutes: businessHours.openMinutes, closeMinutes: businessHours.closeMinutes }).from(businessHours).where(eq(businessHours.businessId, businessId)).orderBy(asc(businessHours.dayOfWeek), asc(businessHours.openMinutes)),
    tx.select({ bookingMode: receptionistProfiles.bookingMode }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, businessId)).limit(1),
    tx.select({ startsAt: closures.startsAt, endsAt: closures.endsAt, reason: closures.reason }).from(closures).where(and(eq(closures.businessId, businessId), gt(closures.endsAt, new Date()))).orderBy(asc(closures.startsAt)),
  ]);
  if (!business[0]) throw jsonError("Business not found.", 404);
  const { timezone } = business[0];
  return {
    timezone,
    hoursSource: business[0].hoursSource,
    bookingMode: normalizeBookingMode(profile[0]?.bookingMode),
    hours,
    closures: closureRows.map((row) => ({ startsAt: localDateTime(row.startsAt, timezone), endsAt: localDateTime(row.endsAt, timezone), reason: row.reason })),
  };
}

function readBody(body: unknown) {
  const fields = typeof body === "object" && body !== null && !Array.isArray(body) ? body as Record<string, unknown> : {};
  if (!Array.isArray(fields.hours) || fields.hours.length > 28) throw jsonError("hours must be a list of up to 28 opening windows.");
  const hours = fields.hours.map((window) => {
    const value = typeof window === "object" && window !== null ? window as Record<string, unknown> : {};
    if (![value.dayOfWeek, value.openMinutes, value.closeMinutes].every((field) => typeof field === "number")) throw jsonError("Each opening window needs dayOfWeek, openMinutes and closeMinutes.");
    return { dayOfWeek: value.dayOfWeek as number, openMinutes: value.openMinutes as number, closeMinutes: value.closeMinutes as number };
  });
  if (fields.closures === undefined) return { hours };
  if (!Array.isArray(fields.closures)) throw jsonError("closures must be a list.");
  const closureList = fields.closures.map((closure) => {
    const value = typeof closure === "object" && closure !== null ? closure as Record<string, unknown> : {};
    if (typeof value.startsAt !== "string" || typeof value.endsAt !== "string" || !["string", "undefined"].includes(typeof value.reason)) throw jsonError("Each closure needs startsAt and endsAt, and an optional reason.");
    return { startsAt: value.startsAt, endsAt: value.endsAt, reason: value.reason as string | undefined };
  });
  return { hours, closures: closureList };
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
      const body = readBody(await readJson(request));
      try {
        await replaceBusinessHoursInTransaction(tx, { businessId, ...body });
      } catch (error) {
        throw jsonError(error instanceof Error ? error.message : "The opening hours are invalid.");
      }
      return await loadHours(tx, businessId);
    }, { minimumRole: "business_admin" }));
  } catch (error) {
    return asApiResponse(error);
  }
}
