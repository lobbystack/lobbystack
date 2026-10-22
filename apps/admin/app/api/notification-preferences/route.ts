import { NextResponse } from "next/server";

import { getNotificationPreferences, normalizeOperatorNotificationEventPreferences, setNotificationPreferences } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";
import { hasVerifiedPhone } from "@/lib/verified-phone";

export const dynamic = "force-dynamic";

export const GET = operatorRoute(async ({ userId, businessId, domain }) => NextResponse.json(await getNotificationPreferences(domain, { userId, businessId, phoneVerified: await hasVerifiedPhone(userId) })));

export const PUT = operatorRoute(async ({ userId, businessId, body, domain }) => {
  if (typeof body.emailEnabled !== "boolean" || typeof body.smsEnabled !== "boolean") return jsonError("Valid notification preferences are required.", 400);
  const eventPreferences = normalizeOperatorNotificationEventPreferences(body.eventPreferences);
  const dailySummaryEnabled = body.dailySummaryEnabled === true;
  const dailySummarySendTime = typeof body.dailySummarySendTime === "string" && body.dailySummarySendTime ? body.dailySummarySendTime : null;
  if (dailySummaryEnabled && (!dailySummarySendTime || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(dailySummarySendTime))) return jsonError("A valid daily summary time is required.", 400);
  if (body.smsEnabled || Object.values(eventPreferences).some(event => event.sms)) {
    const current = await getNotificationPreferences(domain, { userId, businessId, phoneVerified: await hasVerifiedPhone(userId) });
    if (!current.canUseSms) return NextResponse.json({ error: current.smsUnavailableReason === "sender_missing" ? "An alert SMS sender is required for SMS notifications." : "Verify your phone before enabling SMS notifications." }, { status: 400 });
  }
  await setNotificationPreferences(domain, { userId, businessId, emailEnabled: body.emailEnabled, smsEnabled: body.smsEnabled, eventPreferences, dailySummaryEnabled, dailySummarySendTime, ...(typeof body.smsConsent === "boolean" ? { smsConsent: body.smsConsent } : {}) });
  return NextResponse.json({ ok: true });
});
