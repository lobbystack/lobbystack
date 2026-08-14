import { and, asc, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { NextResponse } from "next/server";

import {
  appointments,
  calls,
  contacts,
  conversations,
  services,
  withBusinessTransaction,
} from "@lobbystack/db";
import {
  appendMessage,
  bookAppointment,
  cancelAppointmentForCaller,
  createAppointmentChangeVerification,
  findAvailability,
  getOrCreateConversation,
  issueAppointmentChangeOtp,
  reconcileCallStatus,
  recordUsage,
  recordAiGenerationEvent,
  rescheduleAppointmentForCaller,
  reserveOutboundCallAttempt,
  searchKnowledge,
  setTransferState,
  startCall,
  verifyAppointmentChangeOtp,
} from "@lobbystack/domain";
import { asApiResponse, getAppDatabase, readJson, requireInternalService } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";
import { resolveWebVoiceAccess } from "@/lib/prospect-demo";
import { enforceWebVoiceRateLimits } from "@/lib/web-voice-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = Record<string, unknown>;

function stringValue(body: Body, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredString(body: Body, key: string): string {
  const value = stringValue(body, key);
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function numberValue(body: Body, key: string): number | undefined {
  const value = body[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(body: Body, key: string): boolean {
  return body[key] === true;
}

async function resolveBusinessByCallId(callId: string): Promise<string | undefined> {
  const result = await getAppDatabase().db.execute<{ business_id: string }>(sql`select app.resolve_business_by_call_id(${callId}::uuid) as business_id`);
  return result.rows[0]?.business_id;
}

async function resolveBusinessByProviderCallId(providerCallId: string): Promise<string | undefined> {
  const result = await getAppDatabase().db.execute<{ business_id: string }>(sql`select app.resolve_business_by_call(${providerCallId}) as business_id`);
  return result.rows[0]?.business_id;
}

async function resolveService(context: ReturnType<typeof createWorkerDomainContext>, businessId: string, serviceName: string) {
  return await withBusinessTransaction(context.db, { businessId, actorType: "worker" }, async (tx) => {
    const normalized = serviceName.toLowerCase();
    return (await tx.select({ id: services.id, name: services.name }).from(services).where(and(eq(services.businessId, businessId), eq(services.active, true), or(eq(services.slug, normalized), ilike(services.name, serviceName)))).limit(1))[0];
  });
}

function dateTimeForVoice(date: string, timezone: string, hour = 9, minute = 0): string {
  const value = DateTime.fromISO(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`, { zone: timezone }).toUTC().toISO();
  if (!value) throw new Error("A valid date and timezone are required.");
  return value;
}

async function handleVoiceTool(path: string, body: Body) {
  const context = createWorkerDomainContext();
  const businessId = requiredString(body, "businessId");

  if (path === "find-availability" || path === "check-availability") {
    const serviceName = requiredString(body, "serviceName");
    const timezone = stringValue(body, "timezone") ?? "UTC";
    const service = await resolveService(context, businessId, serviceName);
    if (!service) return { ok: false, reason: "Service is not available." };
    const startsAt = path === "find-availability"
      ? dateTimeForVoice(requiredString(body, "date"), timezone, numberValue(body, "preferredHour24") ?? 9, numberValue(body, "preferredMinute") ?? 0)
      : requiredString(body, "startsAt");
    const slots = await findAvailability(context, { businessId, serviceId: service.id, startsAt, timezone, ...(stringValue(body, "preferredStaffId") ? { staffIds: [stringValue(body, "preferredStaffId")!] } : {}) });
    if (path === "check-availability") {
      return { serviceId: service.id, serviceName: service.name, setupIssue: null, availability: slots };
    }
    return {
      serviceId: service.id,
      serviceName: service.name,
      timezone,
      date: requiredString(body, "date"),
      summary: slots.length > 0 ? `${slots.length} opening found.` : "No opening found.",
      setupIssue: null,
      slots: slots.map((slot) => ({ ...slot, displayTime: DateTime.fromISO(slot.startsAt).setZone(timezone).toFormat("h:mm a") })),
    };
  }

  if (path === "book-appointment") {
    const serviceName = requiredString(body, "serviceName");
    const timezone = stringValue(body, "timezone") ?? "UTC";
    const contactName = stringValue(body, "contactName");
    const preferredStaffId = stringValue(body, "preferredStaffId");
    const service = await resolveService(context, businessId, serviceName);
    if (!service) return { ok: false, reason: "Service is not available." };
    const appointment = await bookAppointment(context, {
      businessId,
      serviceId: service.id,
      startsAt: requiredString(body, "startsAt"),
      timezone,
      contactPhone: requiredString(body, "contactPhone"),
      sourceChannel: stringValue(body, "channel") ?? "voice",
      ...(booleanValue(body, "smsConsentGranted") ? { smsConsentGranted: true } : {}),
      ...(contactName !== undefined ? { contactName } : {}),
      ...(preferredStaffId !== undefined ? { preferredStaffId } : {}),
    });
    return { appointmentId: appointment.appointmentId, contactId: appointment.contactId, serviceId: service.id, serviceName: service.name };
  }

  if (path === "lookup-appointment-for-change") {
    const callerPhone = requiredString(body, "callerPhone");
    return await withBusinessTransaction(context.db, { businessId, actorType: "worker" }, async (tx) => {
      const rows = await tx.select({ id: appointments.id, startsAt: appointments.startsAt, endsAt: appointments.endsAt, status: appointments.status, serviceName: services.name }).from(appointments).innerJoin(contacts, eq(appointments.contactId, contacts.id)).innerJoin(services, eq(appointments.serviceId, services.id)).where(and(eq(appointments.businessId, businessId), eq(contacts.phone, callerPhone), ne(appointments.status, "canceled"))).orderBy(asc(appointments.startsAt));
      return { ok: true, policy: { enabled: rows.length > 0, allowCancel: true, allowReschedule: true, verificationMode: "phone_match_and_facts" }, phoneMatched: rows.length > 0, appointmentCount: rows.length, hasConfirmedAppointments: rows.some((row) => row.status === "confirmed"), appointments: rows.map((row) => ({ appointmentId: row.id, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), serviceName: row.serviceName, status: row.status })) };
    });
  }

  if (path === "verify-appointment-for-change") {
    const appointmentId = stringValue(body, "appointmentId");
    const callerPhone = requiredString(body, "callerPhone");
    if (!appointmentId) return { ok: false, verified: false, reason: "An appointment is required." };
    const verification = await createAppointmentChangeVerification(context, { businessId, appointmentId, callerPhone, action: stringValue(body, "action") === "reschedule" ? "reschedule" : "cancel" });
    if (!verification) return { ok: false, verified: false, reason: "The appointment could not be verified." };
    return { ok: true, verified: false, requiresOtp: true, verificationId: verification.verificationId, appointmentId: verification.appointmentId, contactId: verification.contactId, status: verification.status };
  }

  if (path === "send-appointment-change-otp") {
    return await issueAppointmentChangeOtp(context, { businessId, verificationId: requiredString(body, "verificationId") });
  }

  if (path === "verify-appointment-change-otp") {
    return await verifyAppointmentChangeOtp(context, { businessId, verificationId: requiredString(body, "verificationId"), code: requiredString(body, "code") });
  }

  if (path === "cancel-appointment") {
    if (!booleanValue(body, "finalConfirmation")) return { ok: false, action: "cancel", reason: "Final confirmation is required." };
    const appointmentId = requiredString(body, "appointmentId");
    const callerPhone = requiredString(body, "callerPhone");
    const verificationId = stringValue(body, "verificationId");
    if (!verificationId) return { ok: false, action: "cancel", reason: "The appointment change verification is required." };
    const result = await cancelAppointmentForCaller(context, { businessId, verificationId, appointmentId, callerPhone });
    if (!result) return { ok: false, action: "cancel", reason: "The appointment could not be verified." };
    return { ok: true, action: "cancel", appointmentId, serviceId: result.serviceId, startsAt: result.startsAt.toISOString(), endsAt: result.endsAt.toISOString(), status: "canceled", calendarSyncState: "pending" };
  }

  if (path === "reschedule-appointment") {
    if (!booleanValue(body, "finalConfirmation")) return { ok: false, action: "reschedule", reason: "Final confirmation is required." };
    const appointmentId = requiredString(body, "appointmentId");
    const callerPhone = requiredString(body, "callerPhone");
    const verificationId = stringValue(body, "verificationId");
    if (!verificationId) return { ok: false, action: "reschedule", reason: "The appointment change verification is required." };
    const result = await rescheduleAppointmentForCaller(context, { businessId, appointmentId, callerPhone, startsAt: requiredString(body, "startsAt"), verificationId });
    if (!result) return { ok: false, action: "reschedule", reason: "The appointment could not be verified." };
    return { ok: true, action: "reschedule", appointmentId, serviceId: result.serviceId, startsAt: result.startsAt.toISOString(), endsAt: result.endsAt.toISOString(), status: "confirmed", calendarSyncState: "pending" };
  }

  if (path === "take-message") {
    const conversation = stringValue(body, "conversationId") ? { conversationId: stringValue(body, "conversationId")!, contactId: "" } : await getOrCreateConversation(context, { businessId, contactPhone: stringValue(body, "callbackPhone") ?? "unknown", channel: stringValue(body, "channel") ?? "voice" });
    const messageId = await appendMessage(context, { businessId, conversationId: conversation.conversationId, body: requiredString(body, "message"), direction: "inbound", channel: "dashboard", operatorAlert: { eventKind: "voiceMessage", subject: "New voice message", body: "A caller left a voice message. Open the inbox to review it." } });
    return { inboxItemId: messageId };
  }

  if (path === "search-knowledge") {
    const results = await searchKnowledge(context, { businessId, query: requiredString(body, "query"), limit: 4 });
    return results.map((result) => ({ title: result.title, text: result.content }));
  }

  throw new Error(`Unknown voice tool: ${path}`);
}

export async function POST(request: Request, context: { params: Promise<{ segments: string[] }> }) {
  try {
    const rawBody = await request.text();
    await requireInternalService(request, rawBody);
    const body = (await readJson(new Request("http://internal", { method: "POST", body: rawBody }))) as Body;
    const segments = (await context.params).segments;
    const path = segments.join("/");
    const domain = createWorkerDomainContext();

    if (path === "call/start-web") {
      const access = await resolveWebVoiceAccess({
        businessSlug: requiredString(body, "businessSlug"),
        ...(stringValue(body, "dashboardTestCallToken") ? { dashboardTestCallToken: stringValue(body, "dashboardTestCallToken") } : {}),
        ...(stringValue(body, "prospectDemoToken") ? { prospectDemoToken: stringValue(body, "prospectDemoToken") } : {}),
      });
      if (!access.allowed) return NextResponse.json({ code: access.reason, message: "Web voice access denied." }, { status: access.status });
      const businessId = access.businessId;
      const origin = stringValue(body, "origin");
      if (!origin) return NextResponse.json({ code: "origin_required", message: "Web voice origin is required." }, { status: 400 });
      const ipHash = stringValue(body, "ipHash");
      const visitorId = stringValue(body, "visitorId");
      const widgetId = stringValue(body, "widgetId");
      const providerCallId = requiredString(body, "providerCallId");
      const existingBusinessId = await resolveBusinessByProviderCallId(providerCallId);
      if (existingBusinessId && existingBusinessId !== businessId) return NextResponse.json({ code: "provider_call_conflict", message: "Provider call belongs to another business." }, { status: 409 });
      if (!existingBusinessId) {
        const rateLimit = await enforceWebVoiceRateLimits({
          businessId,
          origin,
          ...(ipHash !== undefined ? { ipHash } : {}),
          ...(visitorId !== undefined ? { visitorId } : {}),
          ...(widgetId !== undefined ? { widgetId } : {}),
          ...(access.mode === "prospect_demo" ? { prospectDemoId: access.prospectDemoId } : { dashboardTestCall: access.dashboardTestCall }),
        }, { consume: true });
        if (!rateLimit.allowed) return NextResponse.json({ code: rateLimit.code, message: "Web voice rate limit reached." }, { status: rateLimit.status });
      }
      const gatewaySessionId = stringValue(body, "gatewaySessionId");
      const startedAt = stringValue(body, "startedAt");
      const originUrl = stringValue(body, "originUrl");
      const userAgent = stringValue(body, "userAgent");
      const maxDurationMs = numberValue(body, "maxDurationMs");
      try {
        const result = await startCall(domain, {
          businessId,
          provider: "openai_realtime",
          providerCallId,
          from: "web",
          to: requiredString(body, "businessSlug"),
          transport: "web_voice",
          billable: access.mode !== "prospect_demo",
          ...(gatewaySessionId !== undefined ? { gatewaySessionId } : {}),
          ...(startedAt !== undefined ? { startedAt } : {}),
          ...(originUrl !== undefined ? { originUrl } : {}),
          ...(userAgent !== undefined ? { userAgent } : {}),
          ...(widgetId !== undefined ? { widgetId } : {}),
          ...(access.mode === "prospect_demo" ? { sessionPurpose: "prospect_demo", prospectDemoId: access.prospectDemoId } : {}),
          ...(maxDurationMs !== undefined ? { maxDurationMs } : {}),
        });
        return NextResponse.json({ businessId, callId: result.callId, conversationId: result.conversationId, ...(result.webCallMaxDurationMs !== undefined ? { webCallMaxDurationMs: result.webCallMaxDurationMs } : {}) });
      } catch (error) {
        const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : undefined;
        const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
        if (status && code) return NextResponse.json({ code, message: error instanceof Error ? error.message : "Web voice start denied." }, { status });
        throw error;
      }
    }

    if (path === "call/web-recording-target") {
      const sessionId = requiredString(body, "gatewaySessionId");
      const result = await getAppDatabase().db.execute<{ call_id: string; business_id: string; provider_call_id: string; started_at: Date; ended_at: Date | null; status: string }>(sql`select call_id, business_id, provider_call_id, started_at, ended_at, status from app.resolve_business_by_gateway_session(${sessionId})`);
      const call = result.rows[0];
      if (!call) return new Response("Not found", { status: 404 });
      const duration = await withBusinessTransaction(domain.db, { businessId: call.business_id, actorType: "worker" }, async (tx) => (await tx.select({ maxDurationMs: calls.webCallMaxDurationMs }).from(calls).where(and(eq(calls.id, call.call_id), eq(calls.businessId, call.business_id))).limit(1))[0]?.maxDurationMs);
      return NextResponse.json({ callId: call.call_id, providerCallId: call.provider_call_id, startedAt: call.started_at.toISOString(), ...(call.ended_at ? { endedAt: call.ended_at.toISOString() } : {}), status: call.status, webCallMaxDurationMs: duration ?? 5 * 60 * 1000 });
    }

    if (path === "call/transfer-state" || path === "call/prepare-transfer" || path === "call/release-transfer") {
      const callId = requiredString(body, "callId");
      const businessId = await resolveBusinessByCallId(callId);
      if (!businessId) return new Response("Call not found", { status: 404 });
      if (path === "call/prepare-transfer") {
        const reservation = await reserveOutboundCallAttempt(domain, { businessId, sourceKey: `outbound_call:${callId}` });
        if (!reservation.allowed) return NextResponse.json({ code: reservation.errorCode ?? "outbound_call_attempt_limit_reached", message: "Outbound transfer limit reached." }, { status: 402 });
      }
      await setTransferState(domain, { businessId, callId, transferState: path === "call/transfer-state" ? requiredString(body, "transferState") : path.endsWith("prepare-transfer") ? "preparing" : "released" });
      return NextResponse.json({ ok: true });
    }

    if (path === "call/system-block-contact") {
      const callId = requiredString(body, "callId");
      const businessId = await resolveBusinessByCallId(callId);
      if (!businessId) return new Response("Call not found", { status: 404 });
      const contactId = await withBusinessTransaction(domain.db, { businessId, actorType: "worker" }, async (tx) => {
        const call = (await tx.select({ contactId: calls.contactId }).from(calls).where(and(eq(calls.id, callId), eq(calls.businessId, businessId))).limit(1))[0];
        if (!call?.contactId) return undefined;
        await tx.update(contacts).set({ operatorBlockedAt: new Date(), updatedAt: new Date() }).where(and(eq(contacts.id, call.contactId), eq(contacts.businessId, businessId)));
        return call.contactId;
      });
      return NextResponse.json({ blocked: Boolean(contactId), ...(contactId ? { contactId } : {}) });
    }

    if (path === "call/ai-cost") {
      const businessId = requiredString(body, "businessId");
      const eventKey = requiredString(body, "eventKey");
      const costUsd = numberValue(body, "costUsd") ?? 0;
      await recordUsage(domain, { businessId, periodKey: new Date().toISOString().slice(0, 7), sourceKey: eventKey, usageKind: "voice.ai.cost", quantity: costUsd, sync: false });
      await recordAiGenerationEvent(domain, {
        businessId,
        operation: stringValue(body, "operation") ?? "voice.realtime",
        provider: stringValue(body, "provider") ?? "openai",
        model: stringValue(body, "model") ?? "unknown",
        latencyMs: 0,
        totalCostUsd: costUsd,
        ...(stringValue(body, "callId") ? { callId: stringValue(body, "callId") } : {}),
        ...(stringValue(body, "conversationId") ? { conversationId: stringValue(body, "conversationId") } : {}),
      }).catch(() => undefined);
      return NextResponse.json({ ok: true });
    }

    if (path === "call/reconcile-status") {
      const providerCallId = requiredString(body, "twilioCallSid");
      const businessId = await resolveBusinessByProviderCallId(providerCallId);
      if (!businessId) return NextResponse.json({ ignored: true, reason: "call_not_found" });
      const providerDurationSeconds = numberValue(body, "providerDurationSeconds");
      return NextResponse.json(await reconcileCallStatus(domain, { businessId, providerCallId, status: requiredString(body, "callStatus"), providerUpdatedAt: requiredString(body, "providerUpdatedAt"), ...(providerDurationSeconds !== undefined ? { providerDurationSeconds } : {}) }));
    }

    if (path.startsWith("tool/")) {
      return NextResponse.json(await handleVoiceTool(path.slice("tool/".length), body));
    }

    return new Response("Not found", { status: 404 });
  } catch (error) {
    return asApiResponse(error);
  }
}
