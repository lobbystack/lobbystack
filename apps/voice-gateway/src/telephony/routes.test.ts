import { createHmac } from "node:crypto";

import type { BusinessContextSnapshot } from "@ai-receptionist/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  fetchSnapshotForPhoneNumberMock,
  startVoiceCallMock,
  completeVoiceCallMock,
  reconcileVoiceCallStatusMock,
  updateVoiceTransferStateMock,
} = vi.hoisted(() => ({
  fetchSnapshotForPhoneNumberMock: vi.fn(),
  startVoiceCallMock: vi.fn(),
  completeVoiceCallMock: vi.fn(),
  reconcileVoiceCallStatusMock: vi.fn(),
  updateVoiceTransferStateMock: vi.fn(),
}));

vi.mock("../context/fetchSnapshot", () => ({
  fetchSnapshotForPhoneNumber: fetchSnapshotForPhoneNumberMock,
}));

vi.mock("../convex/runtimeClient", () => ({
  startVoiceCall: startVoiceCallMock,
  completeVoiceCall: completeVoiceCallMock,
  reconcileVoiceCallStatus: reconcileVoiceCallStatusMock,
  updateVoiceTransferState: updateVoiceTransferStateMock,
}));

import { createServer } from "../http/server";

const snapshot: BusinessContextSnapshot = {
  businessId: "business_123",
  version: "snapshot-v1",
  generatedAt: "2026-03-10T20:00:00.000Z",
  displayName: "Northwind Clinic",
  timezone: "America/Toronto",
  businessType: "clinic",
  greeting: "Hello and welcome.",
  voiceInstructions: "Keep it short.",
  smsInstructions: "Keep it short.",
  summary: "A clinic.",
  bookingPolicy: "Normal policy.",
  knowledgeDigest: "Clinic info.",
  transferPolicy: {
    mode: "never",
  },
  hours: [],
  closures: [],
  services: [],
  priorityFaqs: [],
  contactChannels: {
    phoneNumber: "+14165550000",
  },
};

function signTwilioRequest(path: string, params: Record<string, string>): string {
  const url = new URL(path, process.env.VOICE_GATEWAY_BASE_URL).toString();
  const signedPayload = `${url}${Object.keys(params)
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join("")}`;

  return createHmac("sha1", process.env.TWILIO_AUTH_TOKEN ?? "")
    .update(signedPayload, "utf8")
    .digest("base64");
}

describe("voice routes", () => {
  beforeEach(() => {
    process.env.DEPLOYMENT_MODE = "development";
    process.env.VOICE_GATEWAY_BASE_URL = "https://voice.example.com";
    process.env.CONVEX_SITE_URL = "https://convex.example.com";
    process.env.INTERNAL_SERVICE_TOKEN = "test-service-token";
    process.env.TWILIO_AUTH_TOKEN = "twilio-auth-token";

    fetchSnapshotForPhoneNumberMock.mockResolvedValue(snapshot);
    startVoiceCallMock.mockResolvedValue({
      callId: "call_123",
      conversationId: "conversation_123",
      contactId: "contact_123",
    });
    completeVoiceCallMock.mockResolvedValue(undefined);
    reconcileVoiceCallStatusMock.mockResolvedValue({
      ignored: false,
      callId: "call_123",
    });
    updateVoiceTransferStateMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates the call record from the inbound webhook before the media stream starts", async () => {
    const server = createServer();
    const payload = {
      CallSid: "CA123",
      From: "+14165550123",
      To: "+14165550000",
    };

    const response = await server.inject({
      method: "POST",
      url: "/twilio/voice/inbound",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": signTwilioRequest("/twilio/voice/inbound", payload),
      },
      payload: new URLSearchParams(payload).toString(),
    });

    expect(response.statusCode).toBe(200);
    expect(startVoiceCallMock).toHaveBeenCalledWith({
      businessId: "business_123",
      twilioCallSid: "CA123",
      from: "+14165550123",
      to: "+14165550000",
      startedAt: expect.any(String),
    });

    await server.close();
  });

  it("returns a retryable response when the call-status callback arrives before reconciliation can find the call", async () => {
    const server = createServer();
    const payload = {
      CallSid: "CA123",
      CallStatus: "completed",
    };

    reconcileVoiceCallStatusMock.mockResolvedValueOnce({
      ignored: true,
      reason: "unknown_call",
    });

    const response = await server.inject({
      method: "POST",
      url: "/twilio/voice/call-status",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": signTwilioRequest("/twilio/voice/call-status", payload),
      },
      payload: new URLSearchParams(payload).toString(),
    });

    expect(response.statusCode).toBe(503);
    expect(response.headers["retry-after"]).toBe("1");
    expect(response.body).toBe("Call record not ready");

    await server.close();
  });
});
