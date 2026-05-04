import { describe, expect, it, vi } from "vitest";

import { enqueuePostHogProviderExceptionBestEffort } from "./posthog";

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
      operation: "twilio.sms.send",
      providerErrorCode: "21211",
      runtime: "convex",
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
});
