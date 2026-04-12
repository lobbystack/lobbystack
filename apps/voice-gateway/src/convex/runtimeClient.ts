import { loadVoiceGatewayEnv } from "@ai-receptionist/config";

import {
  recordRecordingUploadFailure,
} from "../observability/posthog";

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
  conversationId?: string;
  contactId: string;
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

export async function completeVoiceCall(input: {
  callId: string;
  status: string;
  endedAt: string;
  disposition?: string;
}): Promise<void> {
  await postJson("/voice/call/complete", input);
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
  usageEventId?: string;
}> {
  return await postJson<{
    ignored: boolean;
    reason?: string;
    callId?: string;
    usageEventId?: string;
  }>(
    "/voice/call/reconcile-status",
    input,
  );
}

export async function syncUsageEventToPolar(input: {
  usageEventId: string;
}): Promise<{ synced: boolean; error?: string }> {
  return await postJson<{ synced: boolean; error?: string }>(
    "/billing/usage/sync",
    input,
  );
}

export async function uploadVoiceRecording(input: {
  callId: string;
  durationMs: number;
  audio: Buffer;
}): Promise<void> {
  const env = loadVoiceGatewayEnv(process.env);
  const url = new URL("/voice/call/recording", env.CONVEX_SITE_URL);
  url.searchParams.set("callId", input.callId);
  url.searchParams.set("durationMs", String(input.durationMs));
  const bytes = Uint8Array.from(input.audio);
  const arrayBuffer = bytes.buffer as ArrayBuffer;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "audio/wav",
      "x-internal-service-token": env.INTERNAL_SERVICE_TOKEN,
    },
    body: new Blob([arrayBuffer], { type: "audio/wav" }),
  });

  if (!response.ok) {
    recordRecordingUploadFailure({
      "ai_receptionist.call_id": input.callId,
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
  preferredStaffId?: string;
  conversationId?: string;
  contactName?: string;
  contactPhone: string;
}): Promise<BookAppointmentResponse> {
  return await postJson<BookAppointmentResponse>("/voice/tool/book-appointment", input);
}

export async function takeVoiceMessage(input: {
  businessId: string;
  callId: string;
  conversationId?: string;
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
