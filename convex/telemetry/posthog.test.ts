import { describe, expect, it, vi } from "vitest";

import {
  emitServiceHealthCheckEvents,
  enqueuePostHogExceptionBestEffort,
  enqueuePostHogProviderExceptionBestEffort,
} from "./posthog";

describe("PostHog provider exception telemetry", () => {
  it("enqueues provider failures with PostHog exception metadata", async () => {
    type SerializedPostHogEvent = {
      eventName: string;
      distinctId: string;
      payloadJson: string;
    };
    const runMutation = vi.fn(
      async (_reference: unknown, _serialized: SerializedPostHogEvent) => null,
    );
    const error = new Error("The 'To' number +14165550123 is not valid.");
    error.stack = [
      "Error: The 'To' number +14165550123 is not valid.",
      "    at sendSms (/Users/raphael/Coding/ai-receptionist/convex/integrations/twilioSms.ts:232:13)",
    ].join("\n");

    const ctx = { runMutation } as unknown as Parameters<
      typeof enqueuePostHogProviderExceptionBestEffort
    >[0];

    await enqueuePostHogProviderExceptionBestEffort(
      ctx,
      {
        provider: "twilio",
        error,
        code: "21211",
        status: 400,
        operation: "twilio.sms.send",
        distinctId: "system:business:biz_123",
      },
    );

    expect(runMutation).toHaveBeenCalledOnce();
    const serialized = runMutation.mock.calls[0]?.[1];
    expect(serialized).toBeDefined();
    if (!serialized) {
      throw new Error("Expected serialized PostHog event payload.");
    }
    expect(serialized).toMatchObject({
      eventName: "$exception",
      distinctId: "system:business:biz_123",
    });

    const payload = JSON.parse(serialized.payloadJson);
    expect(payload.properties).toMatchObject({
      $exception_level: "error",
      $exception_type: "ProviderInvalidRequestError",
      alertable: true,
      expected: false,
      operation: "twilio.sms.send",
      providerErrorCode: "21211",
      runtime: "convex",
      service: "convex",
    });
    expect(payload.properties.$exception_message).toBe("[redacted]");
    expect(payload.properties.providerErrorMessage).toBe("[redacted]");
    expect(payload.properties.$exception_list).toEqual([
      {
        type: "ProviderInvalidRequestError",
        value: "twilio provider failure (invalid_request: 21211)",
        mechanism: {
          handled: true,
          synthetic: false,
          type: "generic",
        },
        stacktrace: {
          type: "raw",
          frames: [
            {
              platform: "node:javascript",
              filename: "convex/integrations/twilioSms.ts",
              function: "sendSms",
              lineno: 232,
              colno: 13,
              in_app: true,
            },
          ],
        },
      },
    ]);
  });

  it("enqueues generic alertable exceptions without raw args", async () => {
    type SerializedPostHogEvent = {
      eventName: string;
      distinctId: string;
      payloadJson: string;
    };
    const runMutation = vi.fn(
      async (_reference: unknown, _serialized: SerializedPostHogEvent) => null,
    );
    const error = new Error("database exploded with phone +14165550123");
    error.name = "DatabaseUnavailableError";
    error.stack = [
      "DatabaseUnavailableError: database exploded with phone +14165550123",
      "    at saveContact (/Users/raphael/Coding/ai-receptionist/convex/dashboard/contacts.ts:44:7)",
    ].join("\n");

    const ctx = { runMutation } as unknown as Parameters<
      typeof enqueuePostHogExceptionBestEffort
    >[0];

    await enqueuePostHogExceptionBestEffort(ctx, {
      error,
      service: "convex",
      operation: "dashboard.contacts.save",
      distinctId: "system:convex:telemetry",
      properties: {
        rawArgs: {
          phone: "+14165550123",
        },
        safeId: "contact_123",
      },
    });

    expect(runMutation).toHaveBeenCalledOnce();
    const serialized = runMutation.mock.calls[0]?.[1];
    expect(serialized).toBeDefined();
    if (!serialized) {
      throw new Error("Expected serialized PostHog event payload.");
    }
    expect(serialized).toMatchObject({
      eventName: "$exception",
      distinctId: "system:convex:telemetry",
    });

    const payload = JSON.parse(serialized.payloadJson);
    expect(payload.properties).toMatchObject({
      $exception_level: "error",
      $exception_type: "DatabaseUnavailableError",
      alertable: true,
      expected: false,
      operation: "dashboard.contacts.save",
      runtime: "convex",
      safeId: "contact_123",
      service: "convex",
    });
    expect(payload.properties).not.toHaveProperty("rawArgs");
    expect(payload.properties.$exception_message).toBe("[redacted]");
    expect(payload.properties.$exception_list).toMatchObject([
      {
        type: "DatabaseUnavailableError",
        value: "convex dashboard.contacts.save failed (DatabaseUnavailableError)",
        mechanism: {
          handled: true,
          synthetic: false,
          type: "generic",
        },
      },
    ]);
  });

  it("emits service health success and failure events", async () => {
    type SerializedPostHogEvent = {
      eventName: string;
      distinctId: string;
      payloadJson: string;
    };
    const runMutation = vi.fn(
      async (_reference: unknown, _serialized: SerializedPostHogEvent) => null,
    );
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("voice.example.com")) {
        return new Response("down", { status: 503 });
      }
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    const results = await emitServiceHealthCheckEvents(
      { runMutation } as unknown as Parameters<typeof emitServiceHealthCheckEvents>[0],
      [
        {
          service: "web",
          url: "https://app.example.com",
        },
        {
          service: "voice-gateway",
          url: "https://voice.example.com/health",
        },
      ],
      fetchImpl,
    );

    expect(results).toMatchObject([
      {
        service: "web",
        status: "healthy",
        httpStatusCode: 200,
        targetUrlHost: "app.example.com",
      },
      {
        service: "voice-gateway",
        status: "unhealthy",
        httpStatusCode: 503,
        errorKind: "http_error",
        targetUrlHost: "voice.example.com",
      },
    ]);
    expect(runMutation).toHaveBeenCalledTimes(3);

    const serializedEvents = runMutation.mock.calls.map((call) => call[1]);
    expect(serializedEvents.map((event) => event.eventName)).toEqual([
      "ops.service.health_check",
      "ops.service.health_check_failed",
      "$exception",
    ]);

    const healthyPayload = JSON.parse(serializedEvents[0]?.payloadJson ?? "{}");
    expect(healthyPayload.properties).toMatchObject({
      service: "web",
      status: "healthy",
      httpStatusCode: 200,
      targetUrlHost: "app.example.com",
    });

    const failedPayload = JSON.parse(serializedEvents[1]?.payloadJson ?? "{}");
    expect(failedPayload.properties).toMatchObject({
      service: "voice-gateway",
      status: "unhealthy",
      httpStatusCode: 503,
      errorKind: "http_error",
      targetUrlHost: "voice.example.com",
    });

    const exceptionPayload = JSON.parse(serializedEvents[2]?.payloadJson ?? "{}");
    expect(exceptionPayload.properties).toMatchObject({
      $exception_type: "ServiceHealthCheckFailed",
      alertable: true,
      expected: false,
      operation: "service_health_check",
      service: "voice-gateway",
    });
  });
});
