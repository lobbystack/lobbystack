import { describe, expect, it, vi } from "vitest";

import type { Id } from "../_generated/dataModel";

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
    expect(payload.properties.$exception_list[0].value).not.toContain(
      "14165550123",
    );
  });

  it("synthesizes a safe exception for generic errors without surfacing the raw message", async () => {
    type SerializedPostHogEvent = {
      eventName: string;
      distinctId: string;
      payloadJson: string;
    };
    const runMutation = vi.fn(
      async (_reference: unknown, _serialized: SerializedPostHogEvent) => null,
    );
    const ctx = { runMutation } as unknown as Parameters<
      typeof enqueuePostHogExceptionBestEffort
    >[0];

    await enqueuePostHogExceptionBestEffort(ctx, {
      error: new Error("Google token refresh failed: {invalid_grant}"),
      service: "convex",
      operation: "convex_internal_action",
      distinctId: "system:convex:telemetry",
    });

    const serialized = runMutation.mock.calls[0]?.[1];
    const payload = JSON.parse(serialized.payloadJson);
    expect(payload.properties.$exception_type).toBe("ApplicationError");
    expect(payload.properties.$exception_list).toMatchObject([
      {
        type: "ApplicationError",
        value: "convex convex_internal_action failed (ApplicationError)",
      },
    ]);
    expect(payload.properties.$exception_list[0].value).not.toContain(
      "invalid_grant",
    );
  });

  it("does not surface raw error content for generic errors", async () => {
    type SerializedPostHogEvent = {
      eventName: string;
      distinctId: string;
      payloadJson: string;
    };
    const runMutation = vi.fn(
      async (_reference: unknown, _serialized: SerializedPostHogEvent) => null,
    );
    const ctx = { runMutation } as unknown as Parameters<
      typeof enqueuePostHogExceptionBestEffort
    >[0];

    await enqueuePostHogExceptionBestEffort(ctx, {
      error: new Error(
        "Could not email john.doe@example.com: " + "x".repeat(700),
      ),
      service: "convex",
      operation: "convex_internal_action",
      distinctId: "system:convex:telemetry",
    });

    const serialized = runMutation.mock.calls[0]?.[1];
    const payload = JSON.parse(serialized.payloadJson);
    const value = payload.properties.$exception_list[0].value;
    expect(value).toBe("convex convex_internal_action failed (ApplicationError)");
    expect(value).not.toContain("john.doe@example.com");
    expect(value.length).toBeLessThanOrEqual(500);
  });

  it("does not leak PII into exception types for generic errors", async () => {
    type SerializedPostHogEvent = {
      eventName: string;
      distinctId: string;
      payloadJson: string;
    };
    const runMutation = vi.fn(
      async (_reference: unknown, _serialized: SerializedPostHogEvent) => null,
    );
    const ctx = { runMutation } as unknown as Parameters<
      typeof enqueuePostHogExceptionBestEffort
    >[0];

    await enqueuePostHogExceptionBestEffort(ctx, {
      error: new Error("john.doe@example.com"),
      service: "convex",
      operation: "convex_internal_action",
      distinctId: "system:convex:telemetry",
    });

    const serialized = runMutation.mock.calls[0]?.[1];
    const payload = JSON.parse(serialized.payloadJson);
    expect(payload.properties.$exception_type).toBe("ApplicationError");
    expect(payload.properties.$exception_type).not.toMatch(
      /john|doe|example/i,
    );
    expect(payload.properties.$exception_list[0].type).toBe("ApplicationError");
  });

  it("does not surface phone numbers from generic error messages", async () => {
    type SerializedPostHogEvent = {
      eventName: string;
      distinctId: string;
      payloadJson: string;
    };
    const runMutation = vi.fn(
      async (_reference: unknown, _serialized: SerializedPostHogEvent) => null,
    );
    const ctx = { runMutation } as unknown as Parameters<
      typeof enqueuePostHogExceptionBestEffort
    >[0];

    await enqueuePostHogExceptionBestEffort(ctx, {
      error: new Error(
        "The phone number +442071838750 is already mapped, retry +33 1 42 68 53 00",
      ),
      service: "convex",
      operation: "convex_internal_action",
      distinctId: "system:convex:telemetry",
    });

    const serialized = runMutation.mock.calls[0]?.[1];
    const payload = JSON.parse(serialized.payloadJson);
    const value = payload.properties.$exception_list[0].value;
    expect(value).toBe("convex convex_internal_action failed (ApplicationError)");
    expect(value).not.toMatch(/\+|\d{4,}/);
    expect(payload.properties.$exception_type).toBe("ApplicationError");
  });

  it("does not leak user-controlled filenames from generic error messages", async () => {
    type SerializedPostHogEvent = {
      eventName: string;
      distinctId: string;
      payloadJson: string;
    };
    const runMutation = vi.fn(
      async (_reference: unknown, _serialized: SerializedPostHogEvent) => null,
    );
    const ctx = { runMutation } as unknown as Parameters<
      typeof enqueuePostHogExceptionBestEffort
    >[0];

    await enqueuePostHogExceptionBestEffort(ctx, {
      error: new Error(
        'Attachment "Medical Records John Doe.pdf" is no longer available.',
      ),
      service: "convex",
      operation: "convex_internal_action",
      distinctId: "system:convex:telemetry",
    });

    const serialized = runMutation.mock.calls[0]?.[1];
    const payload = JSON.parse(serialized.payloadJson);
    expect(payload.properties.$exception_type).toBe("ApplicationError");
    const value = payload.properties.$exception_list[0].value;
    expect(value).not.toContain("John Doe");
    expect(value).not.toContain("Medical Records");
    expect(value).toBe("convex convex_internal_action failed (ApplicationError)");
  });

  it("attaches businessId and groupKey to enqueued exceptions", async () => {
    type SerializedPostHogEvent = {
      eventName: string;
      distinctId: string;
      payloadJson: string;
    };
    const runMutation = vi.fn(
      async (_reference: unknown, _serialized: SerializedPostHogEvent) => null,
    );
    const ctx = { runMutation } as unknown as Parameters<
      typeof enqueuePostHogExceptionBestEffort
    >[0];
    const businessId = "m97bdjb606gbv9ks89a1eamg218a3egz" as Id<"businesses">;

    await enqueuePostHogExceptionBestEffort(ctx, {
      error: new Error("sync failed"),
      service: "convex",
      operation: "convex_internal_action",
      distinctId: "system:convex:telemetry",
      businessId,
      groupKey: `business:${businessId}`,
    });

    const serialized = runMutation.mock.calls[0]?.[1];
    expect(serialized).toMatchObject({
      eventName: "$exception",
      businessId,
      groupKey: `business:${businessId}`,
    });
    const payload = JSON.parse(serialized.payloadJson);
    expect(payload.businessId).toBe(businessId);
    expect(payload.properties.$exception_list[0].value).toBe(
      "convex convex_internal_action failed (ApplicationError)",
    );
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

  it("emits service health failures for malformed configured URLs", async () => {
    type SerializedPostHogEvent = {
      eventName: string;
      distinctId: string;
      payloadJson: string;
    };
    const originalAppBaseUrl = process.env.APP_BASE_URL;
    const originalVoiceGatewayBaseUrl = process.env.VOICE_GATEWAY_BASE_URL;
    process.env.APP_BASE_URL = "https://app.example.com";
    process.env.VOICE_GATEWAY_BASE_URL = "voice.example.com";

    const runMutation = vi.fn(
      async (_reference: unknown, _serialized: SerializedPostHogEvent) => null,
    );
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));

    try {
      const results = await emitServiceHealthCheckEvents(
        { runMutation } as unknown as Parameters<
          typeof emitServiceHealthCheckEvents
        >[0],
        undefined,
        fetchImpl as unknown as typeof fetch,
      );

      expect(results).toMatchObject([
        {
          service: "web",
          status: "healthy",
        },
        {
          service: "voice-gateway",
          status: "unhealthy",
          errorKind: "invalid_config",
        },
      ]);
      expect(fetchImpl).toHaveBeenCalledTimes(1);

      const serializedEvents = runMutation.mock.calls.map((call) => call[1]);
      expect(serializedEvents.map((event) => event.eventName)).toEqual([
        "ops.service.health_check",
        "ops.service.health_check_failed",
        "$exception",
      ]);
      const failedPayload = JSON.parse(serializedEvents[1]?.payloadJson ?? "{}");
      expect(failedPayload.properties).toMatchObject({
        service: "voice-gateway",
        status: "unhealthy",
        errorKind: "invalid_config",
      });
    } finally {
      if (originalAppBaseUrl === undefined) {
        delete process.env.APP_BASE_URL;
      } else {
        process.env.APP_BASE_URL = originalAppBaseUrl;
      }
      if (originalVoiceGatewayBaseUrl === undefined) {
        delete process.env.VOICE_GATEWAY_BASE_URL;
      } else {
        process.env.VOICE_GATEWAY_BASE_URL = originalVoiceGatewayBaseUrl;
      }
    }
  });
});
