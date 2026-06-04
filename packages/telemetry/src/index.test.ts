import { describe, expect, it } from "vitest";

import type { TelemetryEvent } from "./index";
import {
  bucketLatencyMs,
  buildAlertableExceptionTelemetryProperties,
  buildPostHogAiGenerationProperties,
  buildPostHogAiSpanProperties,
  buildPostHogAiTraceProperties,
  buildProviderErrorTelemetryProperties,
  classifyProviderError,
  createTelemetryFacade,
  getTelemetryRequiredProperties,
  getProviderErrorExceptionType,
  getPostHogBusinessGroupKey,
  getPostHogDistinctIdForBusinessSystem,
  getPostHogDistinctIdForOperator,
  isExpectedConvexFailure,
  redactAiTraceProperties,
  redactTelemetryProperties,
  redactOtelAttributes,
  validateTelemetryEvent,
} from "./index";

class MemorySink {
  public events: Array<TelemetryEvent> = [];

  async emit(event: TelemetryEvent): Promise<void> {
    this.events.push(event);
  }
}

describe("telemetry redaction", () => {
  it("redacts bodies, transcripts, tokens, and masks phone numbers", async () => {
    const sink = new MemorySink();
    const telemetry = createTelemetryFacade("development", [sink]);

    await telemetry.track({
      name: "sms.inbound_received",
      businessId: "biz-1",
      properties: {
        customerPhone: "+14165550000",
        body: "My name is Jane Doe",
        transcript: "Full transcript",
        internalToken: "secret",
        harmless: "ok",
      },
    });

    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]?.properties.customerPhone).toBe("***0000");
    expect(sink.events[0]?.properties.body).toBe("[redacted]");
    expect(sink.events[0]?.properties.transcript).toBe("[redacted]");
    expect(sink.events[0]?.properties.internalToken).toBe("[redacted]");
    expect(sink.events[0]?.properties.harmless).toBe("ok");
  });

  it("redacts nested AI trace content while leaving aggregate counters intact", () => {
    const properties = redactAiTraceProperties({
      provider: "openai",
      model: "gpt-realtime",
      $ai_input: "do not leak me",
      $ai_output_choices: "still private",
      prompt: "do not leak me",
      toolArguments: {
        customerName: "Jane Doe",
        requestedTime: "tomorrow morning",
      },
      tokenCount: 42,
      tools: ["checkAvailability", "bookAppointment"],
    });

    expect(properties.provider).toBe("openai");
    expect(properties.model).toBe("gpt-realtime");
    expect(properties.$ai_input).toBe("[redacted]");
    expect(properties.$ai_output_choices).toBe("[redacted]");
    expect(properties.prompt).toBe("[redacted]");
    expect(properties.toolArguments).toBe("[redacted]");
    expect(properties.tokenCount).toBe(42);
    expect(properties.tools).toEqual(["checkAvailability", "bookAppointment"]);
  });

  it("keeps token usage metrics while redacting credential-like token fields", () => {
    const properties = redactAiTraceProperties({
      access_token: "secret-access-token",
      refreshToken: "secret-refresh-token",
      totalTokens: 120,
      inputTokens: 55,
    });

    expect(properties.access_token).toBe("[redacted]");
    expect(properties.refreshToken).toBe("[redacted]");
    expect(properties.totalTokens).toBe(120);
    expect(properties.inputTokens).toBe(55);
  });

  it("preserves workflowName while still redacting sensitive name fields", () => {
    const properties = redactAiTraceProperties({
      workflowName: "appointmentCalendarSyncWorkflow",
      customerName: "Jane Doe",
    });

    expect(properties.workflowName).toBe("appointmentCalendarSyncWorkflow");
    expect(properties.customerName).toBe("[redacted]");
  });

  it("classifies OpenAI insufficient_quota as quota exhausted", () => {
    const classified = classifyProviderError({
      provider: "openai",
      error: {
        error: {
          code: "insufficient_quota",
          message: "You exceeded your current quota.",
        },
        status: 429,
      },
    });

    expect(classified).toMatchObject({
      provider: "openai",
      kind: "quota_exhausted",
      providerErrorCode: "insufficient_quota",
      providerErrorStatus: 429,
    });
    expect(getProviderErrorExceptionType(classified.kind)).toBe(
      "ProviderQuotaExhaustedError",
    );
  });

  it("classifies HTTP 401 and 403 as auth failures", () => {
    expect(
      classifyProviderError({ provider: "twilio", error: { status: 401 } }).kind,
    ).toBe("auth_failed");
    expect(
      classifyProviderError({
        provider: "google",
        error: { response: { status: 403 } },
      }).kind,
    ).toBe("auth_failed");
  });

  it("classifies HTTP 429 as rate limited when it is not quota exhaustion", () => {
    expect(
      classifyProviderError({
        provider: "google",
        error: { status: 429, message: "Rate limit reached." },
      }).kind,
    ).toBe("rate_limited");
  });

  it("classifies OpenAI integer bounds errors as invalid requests before timeout wording", () => {
    const classified = classifyProviderError({
      provider: "openai",
      error: {
        code: "integer_above_max_value",
        message:
          "Invalid value for session.audio.input.turn_detection.idle_timeout_ms: timeout value is above the maximum.",
      },
    });

    expect(classified).toMatchObject({
      provider: "openai",
      kind: "invalid_request",
      providerErrorCode: "integer_above_max_value",
    });
    expect(getProviderErrorExceptionType(classified.kind)).toBe(
      "ProviderInvalidRequestError",
    );
  });

  it("classifies 5xx and network failures as provider unavailable", () => {
    expect(
      classifyProviderError({ provider: "polar", error: { statusCode: 503 } }).kind,
    ).toBe("provider_unavailable");
    expect(
      classifyProviderError({ provider: "firecrawl", error: new Error("fetch failed") })
        .kind,
    ).toBe("provider_unavailable");
  });

  it("classifies unknown error shapes as unknown", () => {
    expect(classifyProviderError({ error: { surprise: true } })).toMatchObject({
      provider: "unknown",
      kind: "unknown",
    });
  });

  it("classifies handled Convex rejections as expected", () => {
    expect(isExpectedConvexFailure(new Error("InvalidSecret"))).toBe(true);
    expect(
      isExpectedConvexFailure(
        new Error("This email is already on your account."),
      ),
    ).toBe(true);
    expect(
      isExpectedConvexFailure(
        new Error(
          "That verification code is invalid or expired. Try requesting a new one.",
        ),
      ),
    ).toBe(true);
    expect(
      isExpectedConvexFailure(
        new Error("Invalid or expired email confirmation link."),
      ),
    ).toBe(true);
    expect(isExpectedConvexFailure(new Error("database exploded"))).toBe(false);
  });

  it("only includes provider on alertable exceptions when provided", () => {
    const withoutProvider = buildAlertableExceptionTelemetryProperties({
      runtime: "web",
      service: "web",
      operation: "calendar_connect",
    });
    const withProvider = buildAlertableExceptionTelemetryProperties({
      runtime: "web",
      service: "web",
      operation: "calendar_connect",
      provider: "google",
    });

    expect(withoutProvider).not.toHaveProperty("provider");
    expect(withProvider).toHaveProperty("provider", "google");
  });

  it("builds provider exception metadata and redacts raw provider messages", () => {
    const properties = buildProviderErrorTelemetryProperties({
      provider: "twilio",
      kind: "invalid_request",
      providerErrorCode: "21211",
      providerErrorMessage:
        "The 'To' number +14165550123 is not a valid phone number.",
      providerErrorStatus: 429,
    });

    expect(properties).toMatchObject({
      provider: "twilio",
      providerErrorKind: "invalid_request",
      providerErrorCode: "21211",
      providerErrorMessage:
        "The 'To' number +14165550123 is not a valid phone number.",
      providerErrorStatus: 429,
      $exception_type: "ProviderInvalidRequestError",
      $exception_message:
        "The 'To' number +14165550123 is not a valid phone number.",
    });
    const redacted = redactTelemetryProperties(properties);
    expect(redacted.provider).toBe("twilio");
    expect(redacted.providerErrorKind).toBe("invalid_request");
    expect(redacted.providerErrorCode).toBe("21211");
    expect(redacted.providerErrorStatus).toBe(429);
    expect(redacted.$exception_type).toBe("ProviderInvalidRequestError");
    expect(redacted.providerErrorMessage).toBe("[redacted]");
    expect(redacted.$exception_message).toBe("[redacted]");
  });

  it("builds metadata-only AI generation properties without message content", () => {
    const properties = buildPostHogAiGenerationProperties({
      traceId: "trace-1",
      sessionId: "session-1",
      model: "gpt-realtime",
      provider: "openai",
      callId: "call-1",
      conversationId: "conv-1",
      messageId: "message-1",
      inputTokens: 12,
      outputTokens: 34,
      totalTokens: 46,
      textInputTokens: 7,
      audioInputTokens: 5,
      cachedInputTokens: 5,
      cachedTextInputTokens: 4,
      cachedAudioInputTokens: 1,
      textOutputTokens: 14,
      audioOutputTokens: 20,
      reasoningTokens: 3,
      totalCostUsd: 0.12,
      latencyMs: 1_500,
      ttftMs: 250,
      isStreaming: true,
      properties: {
        $ai_input: "private",
        $ai_output_choices: "private",
        prompt: "private",
        safeOutcome: "booked",
      },
    });

    expect(properties.$ai_trace_id).toBe("trace-1");
    expect(properties.$ai_session_id).toBe("session-1");
    expect(properties.traceId).toBe("trace-1");
    expect(properties.sessionId).toBe("session-1");
    expect(properties.messageId).toBe("[redacted]");
    expect(properties.messageLinkKey).toBe("message-1");
    expect(properties.model).toBe("gpt-realtime");
    expect(properties.provider).toBe("openai");
    expect(properties.$ai_model).toBe("gpt-realtime");
    expect(properties.$ai_provider).toBe("openai");
    expect(properties.inputTokens).toBe(12);
    expect(properties.outputTokens).toBe(34);
    expect(properties.totalTokens).toBe(46);
    expect(properties.$ai_input_tokens).toBe(12);
    expect(properties.$ai_output_tokens).toBe(34);
    expect(properties.$ai_total_tokens).toBe(46);
    expect(properties.textInputTokens).toBe(7);
    expect(properties.audioInputTokens).toBe(5);
    expect(properties.cachedInputTokens).toBe(5);
    expect(properties.cachedTextInputTokens).toBe(4);
    expect(properties.cachedAudioInputTokens).toBe(1);
    expect(properties.textOutputTokens).toBe(14);
    expect(properties.audioOutputTokens).toBe(20);
    expect(properties.reasoningTokens).toBe(3);
    expect(properties.totalCostUsd).toBe(0.12);
    expect(properties.$ai_total_cost_usd).toBe(0.12);
    expect(properties.latencyMs).toBe(1_500);
    expect(properties.$ai_latency).toBe(1.5);
    expect(properties.ttftMs).toBe(250);
    expect(properties.$ai_time_to_first_token).toBe(0.25);
    expect(properties.isStreaming).toBe(true);
    expect(properties.$ai_stream).toBe(true);
    expect(properties.$ai_input).toBe("[redacted]");
    expect(properties.$ai_output_choices).toBe("[redacted]");
    expect(properties.prompt).toBe("[redacted]");
    expect(properties.safeOutcome).toBe("booked");
  });

  it("builds metadata-only AI trace and span properties", () => {
    const traceProperties = buildPostHogAiTraceProperties({
      traceId: "trace-2",
      sessionId: "session-2",
      model: "gemini-3.1-flash-lite",
      provider: "google",
      conversationId: "conv-2",
    });
    const spanProperties = buildPostHogAiSpanProperties({
      traceId: "trace-2",
      sessionId: "session-2",
      model: "gemini-3.1-flash-lite",
      provider: "google",
      conversationId: "conv-2",
      spanName: "tool_call:searchKnowledge",
      inputState: {
        toolName: "searchKnowledge",
        toolArguments: {
          query: "private",
        },
      },
      outputState: {
        succeeded: true,
        toolResult: {
          text: "private",
        },
      },
      latencyMs: 800,
    });

    expect(traceProperties.$ai_trace_id).toBe("trace-2");
    expect(traceProperties.$ai_session_id).toBe("session-2");
    expect(traceProperties.traceId).toBe("trace-2");
    expect(traceProperties.sessionId).toBe("session-2");
    expect(traceProperties.model).toBe("gemini-3.1-flash-lite");
    expect(traceProperties.provider).toBe("google");
    expect(traceProperties.conversationId).toBe("conv-2");
    expect(spanProperties.spanName).toBe("tool_call:searchKnowledge");
    expect(spanProperties.$ai_span_name).toBe("tool_call:searchKnowledge");
    expect(spanProperties.latencyMs).toBe(800);
    expect(spanProperties.$ai_latency).toBe(0.8);
    expect(spanProperties.$ai_input_state).toEqual({
      toolName: "searchKnowledge",
      toolArguments: "[redacted]",
    });
    expect(spanProperties.$ai_output_state).toEqual({
      succeeded: true,
      toolResult: "[redacted]",
    });
  });

  it("redacts OTEL attributes that might contain customer data", () => {
    const attributes = redactOtelAttributes({
      "lobbystack.customer_phone": "+14165550000",
      "lobbystack.customer_name": "Jane Doe",
      "lobbystack.tool_name": "bookAppointment",
      "http.status_code": 200,
    });

    expect(attributes["lobbystack.customer_phone"]).toBe("***0000");
    expect(attributes["lobbystack.customer_name"]).toBe("[redacted]");
    expect(attributes["lobbystack.tool_name"]).toBe("bookAppointment");
    expect(attributes["http.status_code"]).toBe(200);
  });

  it("builds stable PostHog identity keys", () => {
    expect(getPostHogDistinctIdForOperator("user_123")).toBe("user:user_123");
    expect(getPostHogDistinctIdForBusinessSystem("biz_123")).toBe(
      "system:business:biz_123",
    );
    expect(getPostHogBusinessGroupKey("biz_123")).toBe("business:biz_123");
  });

  it("documents required properties for meaningful product events", () => {
    expect(getTelemetryRequiredProperties("web.messages.reply_sent")).toEqual([
      "businessId",
      "deploymentMode",
      "conversationId",
      "channel",
    ]);
    expect(getTelemetryRequiredProperties("appointment.booked")).toEqual([
      "businessId",
      "deploymentMode",
      "appointmentId",
      "channel",
      "serviceId",
      "sourceChannel",
    ]);
    expect(getTelemetryRequiredProperties("ops.voice.tool_completed")).toEqual([
      "businessId",
      "deploymentMode",
      "callId",
      "provider",
      "model",
      "toolName",
      "latencyBucket",
    ]);
    expect(getTelemetryRequiredProperties("ops.billing.usage_sync_failed")).toEqual([
      "businessId",
      "deploymentMode",
      "provider",
    ]);
    expect(
      getTelemetryRequiredProperties("ops.billing.unit_economics_rollup_recorded"),
    ).toEqual(["businessId", "deploymentMode", "monthKey"]);
    expect(getTelemetryRequiredProperties("voice.provider_cost_recorded")).toEqual([
      "businessId",
      "deploymentMode",
      "callId",
      "channel",
      "provider",
    ]);
  });

  it("validates required telemetry properties across top-level context and event props", () => {
    const valid = validateTelemetryEvent({
      name: "appointment.booked",
      deploymentMode: "cloud",
      businessId: "biz-1",
      appointmentId: "apt-1",
      channel: "sms",
      properties: {
        serviceId: "svc-1",
        sourceChannel: "sms",
      },
    });

    const invalid = validateTelemetryEvent({
      name: "web.messages.thread_opened",
      deploymentMode: "cloud",
      properties: {
        businessId: "biz-1",
      },
    });

    expect(valid).toEqual({ ok: true, missing: [] });
    expect(invalid.ok).toBe(false);
    expect(invalid.missing).toEqual(["conversationId", "channel"]);
  });

  it("buckets operational latency values into stable ranges", () => {
    expect(bucketLatencyMs(120)).toBe("under_500ms");
    expect(bucketLatencyMs(800)).toBe("500ms_to_1s");
    expect(bucketLatencyMs(1_700)).toBe("1s_to_2_5s");
    expect(bucketLatencyMs(3_600)).toBe("2_5s_to_5s");
    expect(bucketLatencyMs(8_100)).toBe("over_5s");
  });
});
