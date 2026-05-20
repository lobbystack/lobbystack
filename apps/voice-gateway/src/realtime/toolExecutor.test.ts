import { describe, expect, it, vi, beforeEach } from "vitest";

import { demoSnapshot } from "@lobbystack/shared";

const {
  cancelVoiceAppointmentMock,
  lookupVoiceAppointmentForChangeMock,
  rescheduleVoiceAppointmentMock,
  searchVoiceKnowledgeMock,
  sendVoiceAppointmentChangeOtpMock,
  verifyVoiceAppointmentChangeOtpMock,
  verifyVoiceAppointmentForChangeMock,
} = vi.hoisted(() => ({
  cancelVoiceAppointmentMock: vi.fn(),
  lookupVoiceAppointmentForChangeMock: vi.fn(),
  rescheduleVoiceAppointmentMock: vi.fn(),
  searchVoiceKnowledgeMock: vi.fn(),
  sendVoiceAppointmentChangeOtpMock: vi.fn(),
  verifyVoiceAppointmentChangeOtpMock: vi.fn(),
  verifyVoiceAppointmentForChangeMock: vi.fn(),
}));

vi.mock("../convex/runtimeClient", () => ({
  bookVoiceAppointment: vi.fn(),
  cancelVoiceAppointment: cancelVoiceAppointmentMock,
  checkVoiceAvailability: vi.fn(),
  findVoiceAvailability: vi.fn(),
  lookupVoiceAppointmentForChange: lookupVoiceAppointmentForChangeMock,
  rescheduleVoiceAppointment: rescheduleVoiceAppointmentMock,
  searchVoiceKnowledge: searchVoiceKnowledgeMock,
  sendVoiceAppointmentChangeOtp: sendVoiceAppointmentChangeOtpMock,
  takeVoiceMessage: vi.fn(),
  updateVoiceTransferState: vi.fn(),
  verifyVoiceAppointmentChangeOtp: verifyVoiceAppointmentChangeOtpMock,
  verifyVoiceAppointmentForChange: verifyVoiceAppointmentForChangeMock,
}));

import { executeVoiceTool } from "./toolExecutor";

describe("executeVoiceTool waitForUser", () => {
  it("returns a silent wait result for background audio turns", async () => {
    const result = await executeVoiceTool({
      toolName: "waitForUser",
      rawArguments: "{}",
      snapshot: demoSnapshot,
      businessId: "business_123",
      callerPhone: "+14165550000",
    });

    expect(result).toEqual({
      result: {
        ok: true,
        action: "wait_for_user",
      },
      suppressResponse: true,
    });
  });
});

describe("executeVoiceTool searchKnowledge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns RAG matches when indexed knowledge search succeeds", async () => {
    searchVoiceKnowledgeMock.mockResolvedValue([
      { title: "Handbook", text: "The handbook says to bring ID." },
    ]);

    const result = await executeVoiceTool({
      toolName: "searchKnowledge",
      rawArguments: JSON.stringify({ query: "What should I bring?" }),
      snapshot: demoSnapshot,
      businessId: "business_123",
      callerPhone: "+14165550000",
    });

    expect(searchVoiceKnowledgeMock).toHaveBeenCalledWith({
      businessId: "business_123",
      query: "What should I bring?",
    });
    expect(result.result).toEqual({
      matches: [{ title: "Handbook", text: "The handbook says to bring ID." }],
      source: "rag",
      fallbackUsed: false,
    });
  });

  it("falls back to snapshot knowledge when RAG returns no matches", async () => {
    searchVoiceKnowledgeMock.mockResolvedValue([]);

    const result = await executeVoiceTool({
      toolName: "searchKnowledge",
      rawArguments: JSON.stringify({ query: "Do I need an appointment?" }),
      snapshot: {
        ...demoSnapshot,
        knowledgeSnippets: [
          {
            id: "snippet-1",
            title: "Appointments",
            content: "Appointments are recommended before walking in.",
            tags: [],
            priority: 10,
          },
        ],
        knowledgeDigest: "Appointments are recommended before walking in.",
      },
      businessId: "business_123",
      callerPhone: "+14165550000",
    });

    expect(result.result).toEqual({
      matches: [
        {
          title: "Appointments",
          text: "Appointments are recommended before walking in.",
        },
        {
          title: "Knowledge digest",
          text: "Appointments are recommended before walking in.",
        },
      ],
      source: "snapshot_fallback",
      fallbackUsed: true,
      fallbackReason: "no_matches",
    });
  });

  it("falls back to snapshot knowledge when RAG retrieval fails", async () => {
    searchVoiceKnowledgeMock.mockRejectedValue(new Error("quota exceeded"));

    const result = await executeVoiceTool({
      toolName: "searchKnowledge",
      rawArguments: JSON.stringify({ query: "parking" }),
      snapshot: {
        ...demoSnapshot,
        knowledgeSnippets: [
          {
            id: "snippet-1",
            title: "Parking",
            content: "Parking is available behind the building.",
            tags: [],
            priority: 10,
          },
        ],
        knowledgeDigest: "Parking is available behind the building.",
      },
      businessId: "business_123",
      callerPhone: "+14165550000",
    });

    expect(result.result).toEqual({
      matches: [
        {
          title: "Parking",
          text: "Parking is available behind the building.",
        },
        {
          title: "Knowledge digest",
          text: "Parking is available behind the building.",
        },
      ],
      source: "snapshot_fallback",
      fallbackUsed: true,
      fallbackReason: "rag_error",
    });
  });

  it("returns an empty result when neither RAG nor snapshot fallback has content", async () => {
    searchVoiceKnowledgeMock.mockResolvedValue([]);

    const result = await executeVoiceTool({
      toolName: "searchKnowledge",
      rawArguments: JSON.stringify({ query: "refunds" }),
      snapshot: {
        ...demoSnapshot,
        knowledgeDigest: "",
        knowledgeSnippets: [],
      },
      businessId: "business_123",
      callerPhone: "+14165550000",
    });

    expect(result.result).toEqual({
      matches: [],
      source: "none",
      fallbackUsed: false,
    });
  });

  it("filters unrelated snapshot fallback matches by the caller query", async () => {
    searchVoiceKnowledgeMock.mockResolvedValue([]);

    const result = await executeVoiceTool({
      toolName: "searchKnowledge",
      rawArguments: JSON.stringify({ query: "refund policy" }),
      snapshot: {
        ...demoSnapshot,
        knowledgeSnippets: [
          {
            id: "snippet-1",
            title: "Parking",
            content: "Parking is available behind the building.",
            tags: [],
            priority: 10,
          },
          {
            id: "snippet-2",
            title: "Refund policy",
            content: "Refunds are only available within 30 days of purchase.",
            tags: [],
            priority: 9,
          },
        ],
        knowledgeDigest:
          "Parking is behind the building. Refunds are only available within 30 days of purchase.",
      },
      businessId: "business_123",
      callerPhone: "+14165550000",
    });

    expect(result.result).toEqual({
      matches: [
        {
          title: "Refund policy",
          text: "Refunds are only available within 30 days of purchase.",
        },
        {
          title: "Knowledge digest",
          text: "Parking is behind the building. Refunds are only available within 30 days of purchase.",
        },
      ],
      source: "snapshot_fallback",
      fallbackUsed: true,
      fallbackReason: "no_matches",
    });
  });
});

describe("executeVoiceTool appointment changes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes caller and conversation context into verification", async () => {
    verifyVoiceAppointmentForChangeMock.mockResolvedValue({
      ok: true,
      verified: true,
      requiresOtp: false,
      verificationId: "verification_123",
      appointmentId: "appointment_123",
      contactId: "contact_123",
      status: "facts_verified",
    });

    const result = await executeVoiceTool({
      toolName: "verifyAppointmentForChange",
      rawArguments: JSON.stringify({
        appointmentId: "appointment_123",
        action: "cancel",
        callerName: "Jane Doe",
        appointmentStartsAt: "2030-05-15T14:00:00.000Z",
      }),
      snapshot: demoSnapshot,
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
      callerPhone: "+14165550199",
    });

    expect(verifyVoiceAppointmentForChangeMock).toHaveBeenCalledWith({
      businessId: "business_123",
      appointmentId: "appointment_123",
      action: "cancel",
      callerPhone: "+14165550199",
      callerName: "Jane Doe",
      appointmentStartsAt: "2030-05-15T14:00:00.000Z",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    expect(result.result).toMatchObject({
      ok: true,
      verificationId: "verification_123",
    });
  });

  it("returns safe tool output when the cancellation mutation rejects", async () => {
    cancelVoiceAppointmentMock.mockRejectedValue(new Error("verification_required"));

    const result = await executeVoiceTool({
      toolName: "cancelAppointment",
      rawArguments: JSON.stringify({
        appointmentId: "appointment_123",
        verificationId: "verification_123",
        finalConfirmation: true,
      }),
      snapshot: demoSnapshot,
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
      callerPhone: "+14165550199",
    });

    expect(cancelVoiceAppointmentMock).toHaveBeenCalledWith({
      businessId: "business_123",
      appointmentId: "appointment_123",
      callerPhone: "+14165550199",
      finalConfirmation: true,
      verificationId: "verification_123",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    expect(result.result).toEqual({
      ok: false,
      reason: "verification_required",
    });
  });

  it("passes caller context into rescheduling and defaults timezone from the snapshot", async () => {
    rescheduleVoiceAppointmentMock.mockResolvedValue({
      ok: true,
      action: "reschedule",
      appointmentId: "appointment_123",
      serviceId: "service_123",
      startsAt: "2030-05-16T15:00:00.000Z",
      endsAt: "2030-05-16T15:30:00.000Z",
      status: "confirmed",
      calendarSyncState: "pending",
    });

    const result = await executeVoiceTool({
      toolName: "rescheduleAppointment",
      rawArguments: JSON.stringify({
        appointmentId: "appointment_123",
        startsAt: "2030-05-16T15:00:00.000Z",
        verificationId: "verification_123",
        finalConfirmation: true,
      }),
      snapshot: demoSnapshot,
      businessId: "business_123",
      callerPhone: "+14165550199",
    });

    expect(rescheduleVoiceAppointmentMock).toHaveBeenCalledWith({
      businessId: "business_123",
      appointmentId: "appointment_123",
      callerPhone: "+14165550199",
      startsAt: "2030-05-16T15:00:00.000Z",
      timezone: demoSnapshot.timezone,
      finalConfirmation: true,
      verificationId: "verification_123",
    });
    expect(result.result).toMatchObject({
      ok: true,
      action: "reschedule",
      calendarSyncState: "pending",
    });
  });

  it("exposes lookup and OTP tools through the same executor path", async () => {
    lookupVoiceAppointmentForChangeMock.mockResolvedValue({
      ok: true,
      policy: {
        enabled: true,
        allowCancel: true,
        allowReschedule: true,
        verificationMode: "otp_required",
      },
      phoneMatched: true,
      appointmentCount: 0,
      hasConfirmedAppointments: false,
      appointments: [],
    });
    sendVoiceAppointmentChangeOtpMock.mockResolvedValue({
      ok: true,
      status: "pending",
      verificationId: "verification_123",
      otpPhone: "+14165550199",
    });
    verifyVoiceAppointmentChangeOtpMock.mockResolvedValue({
      ok: true,
      status: "approved",
      verificationId: "verification_123",
    });

    await executeVoiceTool({
      toolName: "lookupAppointmentForChange",
      rawArguments: "{}",
      snapshot: demoSnapshot,
      businessId: "business_123",
      callerPhone: "+14165550199",
    });
    await executeVoiceTool({
      toolName: "sendAppointmentChangeOtp",
      rawArguments: JSON.stringify({ verificationId: "verification_123" }),
      snapshot: demoSnapshot,
      businessId: "business_123",
      callerPhone: "+14165550199",
    });
    await executeVoiceTool({
      toolName: "verifyAppointmentChangeOtp",
      rawArguments: JSON.stringify({ verificationId: "verification_123", code: "123456" }),
      snapshot: demoSnapshot,
      businessId: "business_123",
      callerPhone: "+14165550199",
    });

    expect(lookupVoiceAppointmentForChangeMock).toHaveBeenCalledWith({
      businessId: "business_123",
      callerPhone: "+14165550199",
    });
    expect(sendVoiceAppointmentChangeOtpMock).toHaveBeenCalledWith({
      verificationId: "verification_123",
    });
    expect(verifyVoiceAppointmentChangeOtpMock).toHaveBeenCalledWith({
      verificationId: "verification_123",
      code: "123456",
    });
  });
});

describe("executeVoiceTool call control", () => {
  it("returns a terminal endCall result", async () => {
    const result = await executeVoiceTool({
      toolName: "endCall",
      rawArguments: JSON.stringify({
        reason: "caller_finished",
        message: "Thanks for calling. Goodbye.",
      }),
      snapshot: demoSnapshot,
      businessId: "business_123",
      callerPhone: "+14165550000",
    });

    expect(result.result).toEqual({
      ok: true,
      reason: "caller_finished",
      message: "Thanks for calling. Goodbye.",
    });
    expect(result.endCall).toEqual({
      reason: "caller_finished",
      message: "Thanks for calling. Goodbye.",
    });
  });

  it("accepts spam as a terminal endCall reason", async () => {
    const result = await executeVoiceTool({
      toolName: "endCall",
      rawArguments: JSON.stringify({
        reason: "spam",
        message: "We'll end the call here. Goodbye.",
      }),
      snapshot: demoSnapshot,
      businessId: "business_123",
      callerPhone: "+14165550000",
    });

    expect(result.result).toEqual({
      ok: true,
      reason: "spam",
      message: "We'll end the call here. Goodbye.",
    });
    expect(result.endCall).toEqual({
      reason: "spam",
      message: "We'll end the call here. Goodbye.",
    });
  });

  it("rejects invalid endCall reasons", async () => {
    await expect(
      executeVoiceTool({
        toolName: "endCall",
        rawArguments: JSON.stringify({
          reason: "done",
          message: "Goodbye.",
        }),
        snapshot: demoSnapshot,
        businessId: "business_123",
        callerPhone: "+14165550000",
      }),
    ).rejects.toThrow();
  });

  it("caps a hold request to the single-hold maximum", async () => {
    const result = await executeVoiceTool({
      toolName: "setCallHold",
      rawArguments: JSON.stringify({
        durationSeconds: 300,
        reason: "Caller asked for a minute to check their calendar.",
      }),
      snapshot: demoSnapshot,
      businessId: "business_123",
      callerPhone: "+14165550000",
    });

    expect(result.hold).toMatchObject({
      ok: true,
      requestedDurationSeconds: 300,
      grantedDurationSeconds: 120,
      remainingHoldSeconds: 180,
      capped: true,
    });
  });

  it("reports exhausted cumulative hold budget", async () => {
    const result = await executeVoiceTool({
      toolName: "setCallHold",
      rawArguments: JSON.stringify({
        durationSeconds: 30,
        reason: "Caller asked for more time.",
      }),
      snapshot: demoSnapshot,
      businessId: "business_123",
      callerPhone: "+14165550000",
      holdBudget: {
        remainingHoldSeconds: 0,
      },
    });

    expect(result.hold).toEqual({
      ok: false,
      requestedDurationSeconds: 30,
      grantedDurationSeconds: 0,
      remainingHoldSeconds: 0,
      capped: true,
      reason: "Caller asked for more time.",
      error: "hold_limit_reached",
    });
  });
});
