import { NextResponse } from "next/server";

import { analyticsGranularities, getAnalytics, type AnalyticsGranularity } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

function parseDate(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("Analytics dates must be valid ISO dates.");
  return parsed;
}

export async function GET(request: Request) {
  try {
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    if (!businessId) return NextResponse.json({ error: "A businessId is required." }, { status: 400 });
    const url = new URL(request.url);
    const now = new Date();
    const requestedDays = Number(url.searchParams.get("days") ?? 30);
    const defaultFrom = new Date(now.getTime() - (Number.isFinite(requestedDays) ? Math.min(Math.max(Math.trunc(requestedDays), 1), 365) : 30) * 86_400_000);
    const from = parseDate(url.searchParams.get("from"), defaultFrom);
    const to = parseDate(url.searchParams.get("to"), now);
    const span = to.getTime() - from.getTime();
    if (span <= 0 || span > 366 * 86_400_000) throw new Error("Analytics range must be positive and no longer than 366 days.");
    const requestedGranularity = url.searchParams.get("granularity") ?? "day";
    if (!analyticsGranularities.includes(requestedGranularity as AnalyticsGranularity)) throw new Error("Analytics granularity is invalid.");
    const previousFrom = new Date(from.getTime() - span);
    return NextResponse.json(await getAnalytics(createDomainContext(), { userId: session.user.id, businessId, from, to, previousFrom, granularity: requestedGranularity as AnalyticsGranularity }));
  } catch (error) {
    return asApiResponse(error);
  }
}
