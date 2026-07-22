import { loadVoiceGatewayEnv } from "@lobbystack/config";

import {
  recordRecordingUploadFailure,
} from "../observability/posthog";
import type { BusinessContextSnapshot } from "@lobbystack/shared";

export class RuntimeRequestError extends Error {
  status: number;
  code?: string;

  constructor(input: { message: string; status: number; code?: string }) {
    super(input.message);
    this.name = "RuntimeRequestError";
    this.status = input.status;
    if (input.code !== undefined) {
      this.code = input.code;
    }
  }
}

type StartCallResponse = {
  callId: string;
  blocked: boolean;
  conversationId?: string;
  contactId: string;
};

type WebVoiceContextResponse = {
  businessId: string;
  snapshot: BusinessContextSnapshot;
  sessionMode?: "prospect_demo";
  prospectDemoId?: string;
};

type StartWebCallResponse = {
  businessId: string;
  callId: string;
  conversationId: string;
};

type WebCallRecordingTargetResponse = {
  callId: string;
  providerCallId?: string;
  startedAt: string;
  endedAt?: string;
  status: string;
  webCallMaxDurationMs?: number;
};

type CheckAvailabilityResponse = {
  serviceId: string;
  serviceName: string;
  setupIssue?: string | null;
  availability: Array<{
    staffId: string;
    serviceId: string;
    startsAt: string;
    endsAt: string;
  }>;
};

type FindAvailabilityResponse = {
  serviceId: string;
  serviceName: string;
  timezone: string;
  date: string;
  summary: string;
  setupIssue?: string | null;
  slots: Array<{
    startsAt: string;
    endsAt: string;
    displayTime: string;
  }>;
};

type BookAppointmentResponse = {
  appointmentId: string;
  contactId: string;
  serviceId: string;
  serviceName: string;
};

type AppointmentChangePolicy = {
  enabled: boolean;
  allowCancel: boolean;
  allowReschedule: boolean;
  verificationMode: "phone_match_and_facts" | "otp_required" | "operator_only";
};

type AppointmentChangeLookupResponse = {
  ok: true;
  policy: AppointmentChangePolicy;
  phoneMatched: boolean;
  appointmentCount: number;
  hasConfirmedAppointments: boolean;
  appointments: Array<Record<string, never>>;
};

type AppointmentChangeVerifyResponse =
  | {
      ok: true;
      verified: true;
      requiresOtp: boolean;
      verificationId: string;
      appointmentId: string;
      contactId: string;
      status: string;
    }
  | {
      ok: false;
      verified: false;
      reason: string;
    };

type AppointmentChangeOtpResponse =
  | {
      ok: true;
      status: string;
      verificationId: string;
      otpPhone?: string;
    }
  | {
      ok: false;
      status?: string;
      reason: string;
    };

type AppointmentChangeMutationResponse =
  | {
      ok: true;
      action: "cancel" | "reschedule";
      appointmentId: string;
      serviceId: string;
      startsAt: string;
      endsAt: string;
      status: string;
      calendarSyncState: string;
    }
  | {
      ok: false;
      action: "cancel" | "reschedule";
      reason: string;
    };

type TakeMessageResponse = {
  inboxItemId: string;
};

type SearchVoiceKnowledgeResponse = Array<{
  title?: string;
  text: string;
}>;

function getRuntimeBaseUrl(): string {
  return loadVoiceGatewayEnv(process.env).CONVEX_SITE_URL;
}

function getRuntimeHeaders(): HeadersInit {
  const env = loadVoiceGatewayEnv(process.env);
  return {
    "Content-Type": "application/json",
    "x-internal-service-token": env.INTERNAL_SERVICE_TOKEN,
  };
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as {
        code?: string;
        message?: string;
      };
      throw new RuntimeRequestError({
        message: payload.message ?? `Runtime request failed with status ${response.status}.`,
        status: response.status,
        ...(payload.code ? { code: payload.code } : {}),
      });
    }

    throw new RuntimeRequestError({
      message: await response.text(),
      status: response.status,
    });
  }
  return (await response.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${getRuntimeBaseUrl()}${path}`, {
    method: "POST",
    headers: getRuntimeHeaders(),
    body: JSON.stringify(body),
  });
  return await parseJsonResponse<T>(response);
}

export async function startVoiceCall(input: {
  businessId: string;
  twilioCallSid: string;
  gatewaySessionId?: string;
  from: string;
  to: string;
  startedAt: string;
}): Promise<StartCallResponse> {
  return await postJson<StartCallResponse>("/voice/call/start", input);
}

export async function fetchWebVoiceContext(input: {
  businessSlug: string;
  dashboardTestCallToken?: string;
  origin?: string;
  ipHash?: string;
  visitorId?: string;
  widgetId?: string;
  prospectDemoToken?: string;
}): Promise<WebVoiceContextResponse> {
  return await postJson<WebVoiceContextResponse>("/voice/context/by-slug", input);
}

export async function startWebVoiceCall(input: {
  businessSlug: string;
  providerCallId: string;
  gatewaySessionId?: string;
  originUrl?: string;
  userAgent?: string;
  widgetId?: string;
  maxDurationMs?: number;
  startedAt: string;
  prospectDemoToken?: string;
  dashboardTestCallToken?: string;
}): Promise<StartWebCallResponse> {
  return await postJson<StartWebCallResponse>("/voice/call/start-web", input);
}

export async function fetchWebCallRecordingTarget(input: {
  gatewaySessionId: string;
}): Promise<WebCallRecordingTargetResponse | null> {
  try {
    return await postJson<WebCallRecordingTargetResponse>(
      "/voice/call/web-recording-target",
      input,
    );
  } catch (error) {
    if (error instanceof RuntimeRequestError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function appendVoiceTranscript(input: {
  businessId: string;
  callId: string;
  sequence: number;
  speaker: string;
  text: string;
  final: boolean;
  confidence?: number;
}): Promise<void> {
  await postJson("/voice/call/transcript", input);
}

export async function updateVoiceTransferState(input: {
  callId: string;
  transferState: string;
}): Promise<void> {
  await postJson("/voice/call/transfer-state", input);
}

export async function prepareVoiceTransfer(input: {
  callId?: string;
  twilioCallSid?: string;
  recordedAt: string;
}): Promise<void> {
  await postJson("/voice/call/prepare-transfer", input);
}

export async function releaseVoiceTransfer(input: {
  callId?: string;
  twilioCallSid?: string;
  recordedAt: string;
}): Promise<void> {
  await postJson("/voice/call/release-transfer", input);
}

export async function completeVoiceCall(input: {
  callId: string;
  status: string;
  endedAt: string;
  disposition?: string;
  providerDurationSeconds?: number;
}): Promise<void> {
  await postJson("/voice/call/complete", input);
}

export async function systemBlockContactForVoiceCall(input: {
  callId: string;
  blockedAt: string;
}): Promise<{ blocked: boolean; contactId?: string; reason?: string }> {
  return await postJson<{ blocked: boolean; contactId?: string; reason?: string }>(
    "/voice/call/system-block-contact",
    input,
  );
}

export async function recordVoiceAiCost(input: {
  businessId: string;
  callId: string;
  occurredAt: string;
  eventKey: string;
  costUsd: number;
  provider: string;
  model: string;
  operation?: string;
  conversationId?: string;
}): Promise<void> {
  await postJson("/voice/call/ai-cost", input);
}

export async function reconcileVoiceCallStatus(input: {
  twilioCallSid: string;
  callStatus: string;
  sequenceNumber?: number;
  callbackSource?: string;
  providerUpdatedAt: string;
  providerDurationSeconds?: number;
}): Promise<{
  ignored: boolean;
  reason?: string;
  callId?: string;
}> {
  return await postJson<{
    ignored: boolean;
    reason?: string;
    callId?: string;
  }>(
    "/voice/call/reconcile-status",
    input,
  );
}

export async function uploadVoiceRecording(input: {
  callId: string;
  durationMs: number;
  audio: Buffer;
  contentType?: string;
}): Promise<void> {
  const env = loadVoiceGatewayEnv(process.env);
  const url = new URL("/voice/call/recording", env.CONVEX_SITE_URL);
  url.searchParams.set("callId", input.callId);
  url.searchParams.set("durationMs", String(input.durationMs));
  const bytes = Uint8Array.from(input.audio);
  const arrayBuffer = bytes.buffer as ArrayBuffer;
  const contentType = input.contentType ?? "audio/wav";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      "x-internal-service-token": env.INTERNAL_SERVICE_TOKEN,
    },
    body: new Blob([arrayBuffer], { type: contentType }),
  });

  if (!response.ok) {
    recordRecordingUploadFailure({
      "lobbystack.call_id": input.callId,
    });
    throw new Error(await response.text());
  }
}

export async function findVoiceAvailability(input: {
  businessId: string;
  serviceName: string;
  date: string;
  timezone: string;
  preferredStaffId?: string;
  preferredHour24?: number;
  preferredMinute?: number;
  limit?: number;
}): Promise<FindAvailabilityResponse> {
  return await postJson<FindAvailabilityResponse>("/voice/tool/find-availability", input);
}

export async function checkVoiceAvailability(input: {
  businessId: string;
  serviceName: string;
  startsAt: string;
  timezone: string;
  preferredStaffId?: string;
}): Promise<CheckAvailabilityResponse> {
  return await postJson<CheckAvailabilityResponse>("/voice/tool/check-availability", input);
}

export async function bookVoiceAppointment(input: {
  businessId: string;
  serviceName: string;
  startsAt: string;
  timezone: string;
  channel?: "voice" | "web_voice";
  preferredStaffId?: string;
  conversationId?: string;
  contactName?: string;
  contactPhone: string;
  smsConsentGranted: boolean;
}): Promise<BookAppointmentResponse> {
  return await postJson<BookAppointmentResponse>("/voice/tool/book-appointment", input);
}

export async function lookupVoiceAppointmentForChange(input: {
  businessId: string;
  callerPhone: string;
}): Promise<AppointmentChangeLookupResponse> {
  return await postJson<AppointmentChangeLookupResponse>(
    "/voice/tool/lookup-appointment-for-change",
    input,
  );
}

export async function verifyVoiceAppointmentForChange(input: {
  businessId: string;
  appointmentId?: string;
  action: "cancel" | "reschedule";
  callerPhone: string;
  callerName?: string;
  appointmentStartsAt?: string;
  serviceName?: string;
  callId?: string;
  conversationId?: string;
}): Promise<AppointmentChangeVerifyResponse> {
  return await postJson<AppointmentChangeVerifyResponse>(
    "/voice/tool/verify-appointment-for-change",
    input,
  );
}

export async function sendVoiceAppointmentChangeOtp(input: {
  verificationId: string;
}): Promise<AppointmentChangeOtpResponse> {
  return await postJson<AppointmentChangeOtpResponse>(
    "/voice/tool/send-appointment-change-otp",
    input,
  );
}

export async function verifyVoiceAppointmentChangeOtp(input: {
  verificationId: string;
  code: string;
}): Promise<AppointmentChangeOtpResponse> {
  return await postJson<AppointmentChangeOtpResponse>(
    "/voice/tool/verify-appointment-change-otp",
    input,
  );
}

export async function cancelVoiceAppointment(input: {
  businessId: string;
  appointmentId: string;
  callerPhone: string;
  finalConfirmation: boolean;
  verificationId?: string;
  callId?: string;
  conversationId?: string;
}): Promise<AppointmentChangeMutationResponse> {
  return await postJson<AppointmentChangeMutationResponse>(
    "/voice/tool/cancel-appointment",
    input,
  );
}

export async function rescheduleVoiceAppointment(input: {
  businessId: string;
  appointmentId: string;
  callerPhone: string;
  startsAt: string;
  timezone?: string;
  preferredStaffId?: string;
  finalConfirmation: boolean;
  verificationId?: string;
  callId?: string;
  conversationId?: string;
}): Promise<AppointmentChangeMutationResponse> {
  return await postJson<AppointmentChangeMutationResponse>(
    "/voice/tool/reschedule-appointment",
    input,
  );
}

export async function takeVoiceMessage(input: {
  businessId: string;
  callId: string;
  conversationId?: string;
  channel?: "voice" | "web_voice";
  callerName?: string;
  callbackPhone?: string;
  message: string;
  urgency?: string;
  callbackWindow?: string;
}): Promise<TakeMessageResponse> {
  return await postJson<TakeMessageResponse>("/voice/tool/take-message", input);
}

export async function searchVoiceKnowledge(input: {
  businessId: string;
  query: string;
}): Promise<SearchVoiceKnowledgeResponse> {
  return await postJson<SearchVoiceKnowledgeResponse>("/voice/tool/search-knowledge", input);
}
