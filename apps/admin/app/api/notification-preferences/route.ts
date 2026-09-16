import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { users } from "@lobbystack/db";
import { defaultOperatorNotificationEventPreferences, getNotificationPreferences, operatorNotificationEventKeys, setNotificationPreferences, type OperatorNotificationEventPreferences } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, readJson, requireApiSession } from "@/lib/api-helpers";
import { getAuthDatabase } from "@/lib/auth";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    if (!businessId) return NextResponse.json({ error: "A businessId is required." }, { status: 400 });
    const user = (await getAuthDatabase().db.select({ phone: users.phone, phoneVerifiedAt: users.phoneVerifiedAt }).from(users).where(eq(users.id, session.user.id)).limit(1))[0];
    return NextResponse.json(await getNotificationPreferences(createDomainContext(), { userId: session.user.id, businessId, phoneVerified: Boolean(user?.phone && user.phoneVerifiedAt) }));
  } catch (error) { return asApiResponse(error); }
}

export async function PUT(request: Request) {
  try {
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    const body = await readJson(request) as Record<string, unknown>;
    if (!businessId || typeof body.emailEnabled !== "boolean" || typeof body.smsEnabled !== "boolean") return NextResponse.json({ error: "Valid notification preferences are required." }, { status: 400 });
    const defaults = defaultOperatorNotificationEventPreferences();
    const rawEvents = typeof body.eventPreferences === "object" && body.eventPreferences !== null ? body.eventPreferences as Record<string, unknown> : {};
    const eventPreferences = Object.fromEntries(operatorNotificationEventKeys.map((key) => {
      const value = rawEvents[key];
      return [key, typeof value === "object" && value !== null && typeof (value as { email?: unknown }).email === "boolean" && typeof (value as { sms?: unknown }).sms === "boolean" ? value : defaults[key]];
    })) as OperatorNotificationEventPreferences;
    const dailySummaryEnabled = body.dailySummaryEnabled === true;
    const dailySummarySendTime = typeof body.dailySummarySendTime === "string" && body.dailySummarySendTime ? body.dailySummarySendTime : null;
    if (dailySummaryEnabled && (!dailySummarySendTime || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(dailySummarySendTime))) return NextResponse.json({ error: "A valid daily summary time is required." }, { status: 400 });
    if (body.smsEnabled || Object.values(eventPreferences).some(event => event.sms)) {
      const [user] = await getAuthDatabase().db.select({ phone: users.phone, phoneVerifiedAt: users.phoneVerifiedAt }).from(users).where(eq(users.id, session.user.id));
      const current = await getNotificationPreferences(createDomainContext(), { userId: session.user.id, businessId, phoneVerified: Boolean(user?.phone && user.phoneVerifiedAt) });
      if (!current.canUseSms) return NextResponse.json({ error: current.smsUnavailableReason === "sender_missing" ? "An alert SMS sender is required for SMS notifications." : "Verify your phone before enabling SMS notifications." }, { status: 400 });
    }
    await setNotificationPreferences(createDomainContext(), { userId: session.user.id, businessId, emailEnabled: body.emailEnabled, smsEnabled: body.smsEnabled, eventPreferences, dailySummaryEnabled, dailySummarySendTime, ...(typeof body.smsConsent === "boolean" ? { smsConsent: body.smsConsent } : {}) });
    return NextResponse.json({ ok: true });
  } catch (error) { return asApiResponse(error); }
}
