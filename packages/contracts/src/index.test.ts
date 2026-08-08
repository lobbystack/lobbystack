import { describe, expect, it } from "vitest";

import {
  appendTranscriptRequestSchema,
  businessContextSnapshotSchema,
  errorResponseSchema,
  jobEnvelopeSchema,
  outboxMessageSchema,
  realtimeEventSchema,
  traceContextSchema,
  uploadFinalizeRequestSchema,
} from "./index";

describe("replacement platform contracts", () => {
  it("accepts W3C trace context", () => {
    expect(
      traceContextSchema.parse({
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      }),
    ).toEqual({
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    });
  });

  it("rejects malformed HTTP error payloads", () => {
    expect(() => errorResponseSchema.parse({ error: "bad" })).toThrow();
  });

  it("keeps transcript sequence and speaker contracts explicit", () => {
    expect(
      appendTranscriptRequestSchema.parse({
        businessId: "business-1",
        callId: "call-1",
        sequence: 1,
        speaker: "caller",
        text: "hello",
        final: true,
      }).sequence,
    ).toBe(1);
  });

  it("limits realtime events to reference payloads", () => {
    expect(
      realtimeEventSchema.parse({
        type: "call.updated",
        payload: {
          businessId: "00000000-0000-0000-0000-000000000001",
          entityId: "00000000-0000-0000-0000-000000000002",
          revision: 3,
        },
      }).type,
    ).toBe("call.updated");
  });

  it("accepts the runtime business snapshot shape", () => {
    expect(
      businessContextSnapshotSchema.parse({
        businessId: "business-1",
        version: "2026-08-07T00:00:00.000Z",
        generatedAt: "2026-08-07T00:00:00.000Z",
        displayName: "Maple Clinic",
        timezone: "America/Toronto",
        defaultLocale: "en",
        businessType: "clinic",
        greeting: "Thank you for calling.",
        voiceInstructions: "Be helpful.",
        smsInstructions: "Reply briefly.",
        summary: "A clinic.",
        bookingPolicy: "Confirm details.",
        knowledgeDigest: "Front desk facts.",
        transferPolicy: { mode: "on_urgent", transferNumber: "+14165550100" },
        appointmentChangePolicy: {
          enabled: true,
          allowCancel: true,
          allowReschedule: true,
          verificationMode: "phone_match_and_facts",
        },
        hours: [{ dayOfWeek: 1, openMinutes: 540, closeMinutes: 1020 }],
        closures: [],
        services: [{ id: "service-1", name: "Checkup", durationMinutes: 30 }],
        contactChannels: { smsNumber: "+14165550100" },
      }).displayName,
    ).toBe("Maple Clinic");
  });

  it("accepts upload finalization payloads", () => {
    expect(
      uploadFinalizeRequestSchema.parse({
        objectId: "00000000-0000-0000-0000-000000000001",
        length: 1024,
        contentType: "application/pdf",
        checksumSha256: "a".repeat(64),
      }).length,
    ).toBe(1024);
  });

  it("accepts outbox envelopes with trace context", () => {
    expect(
      outboxMessageSchema.parse({
        id: "00000000-0000-0000-0000-000000000001",
        topic: "call.updated",
        businessId: "00000000-0000-0000-0000-000000000002",
        aggregateType: "call",
        aggregateId: "00000000-0000-0000-0000-000000000003",
        dedupeKey: "call:updated:1",
        payload: { revision: 1 },
        availableAt: "2026-08-07T00:00:00.000Z",
        attempts: 0,
        traceContext: {
          traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
          tracestate: "vendor=value",
        },
      }).topic,
    ).toBe("call.updated");
  });

  it("accepts job envelopes with optional trace context", () => {
    expect(
      jobEnvelopeSchema.parse({
        jobId: "00000000-0000-0000-0000-000000000001",
        jobType: "email.send",
        payload: { businessId: "00000000-0000-0000-0000-000000000002" },
      }).jobType,
    ).toBe("email.send");
  });
});
