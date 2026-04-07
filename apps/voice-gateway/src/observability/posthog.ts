import { PostHog } from "posthog-node";

import { loadVoiceGatewayEnv } from "@ai-receptionist/config";
import {
  getPostHogBusinessGroupKey,
  getPostHogDistinctIdForBusinessSystem,
  redactAiTraceProperties,
  redactTelemetryProperties,
  type TelemetryProperties,
} from "@ai-receptionist/telemetry";

type AiTraceCommon = {
  businessId: string;
  traceId: string;
  callId?: string;
  conversationId?: string;
  model: string;
  provider: string;
};

let client: PostHog | null | undefined;

function getClient(): PostHog | null {
  if (client !== undefined) {
    return client;
  }

  const env = loadVoiceGatewayEnv(process.env);
  if (!env.POSTHOG_KEY || !env.POSTHOG_HOST) {
    client = null;
    return client;
  }

  client = new PostHog(env.POSTHOG_KEY, {
    host: env.POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
    enableExceptionAutocapture: true,
  });
  return client;
}

function buildBaseProperties(input: AiTraceCommon): Record<string, unknown> {
  return {
    $ai_trace_id: input.traceId,
    $ai_model: input.model,
    $ai_provider: input.provider,
    ...(input.callId ? { callId: input.callId } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    $groups: {
      business: getPostHogBusinessGroupKey(input.businessId),
    },
  };
}

function capture(
  event: string,
  businessId: string,
  properties: Record<string, unknown>,
): void {
  const activeClient = getClient();
  if (!activeClient) {
    return;
  }

  activeClient.capture({
    distinctId: getPostHogDistinctIdForBusinessSystem(businessId),
    event,
    properties,
  });
}

export function captureAiTraceStarted(input: AiTraceCommon): void {
  capture("$ai_trace", input.businessId, buildBaseProperties(input));
}

export function captureAiGeneration(
  input: AiTraceCommon & {
    latencyMs?: number;
    isError?: boolean;
    error?: string;
    toolNames?: string[];
    transferInvoked?: boolean;
    bookingAttempted?: boolean;
    bookingSucceeded?: boolean;
    fallbackReason?: string;
    properties?: TelemetryProperties;
  },
): void {
  const latencySeconds =
    input.latencyMs !== undefined ? input.latencyMs / 1000 : undefined;
  capture("$ai_generation", input.businessId, {
    ...buildBaseProperties(input),
    ...(latencySeconds !== undefined ? { $ai_latency: latencySeconds } : {}),
    ...(input.isError !== undefined ? { $ai_is_error: input.isError } : {}),
    ...(input.error ? { $ai_error: input.error } : {}),
    ...(input.toolNames?.length ? { $ai_tools_called: input.toolNames } : {}),
    ...(input.transferInvoked !== undefined
      ? { transferInvoked: input.transferInvoked }
      : {}),
    ...(input.bookingAttempted !== undefined
      ? { bookingAttempted: input.bookingAttempted }
      : {}),
    ...(input.bookingSucceeded !== undefined
      ? { bookingSucceeded: input.bookingSucceeded }
      : {}),
    ...(input.fallbackReason ? { fallbackReason: input.fallbackReason } : {}),
    ...redactAiTraceProperties(input.properties ?? {}),
  });
}

export function captureAiSpan(
  input: AiTraceCommon & {
    spanName: string;
    latencyMs?: number;
    isError?: boolean;
    error?: string;
    properties?: TelemetryProperties;
  },
): void {
  const latencySeconds =
    input.latencyMs !== undefined ? input.latencyMs / 1000 : undefined;
  capture("$ai_span", input.businessId, {
    ...buildBaseProperties(input),
    $ai_span_name: input.spanName,
    ...(latencySeconds !== undefined ? { $ai_latency: latencySeconds } : {}),
    ...(input.isError !== undefined ? { $ai_is_error: input.isError } : {}),
    ...(input.error ? { $ai_error: input.error } : {}),
    ...redactAiTraceProperties(input.properties ?? {}),
  });
}

export async function shutdownPostHog(): Promise<void> {
  if (client) {
    await client.shutdown();
  }
}

export function capturePostHogException(
  error: unknown,
  input?: {
    businessId?: string;
    distinctId?: string;
    properties?: TelemetryProperties;
  },
): void {
  const activeClient = getClient();
  if (!activeClient) {
    return;
  }

  const env = loadVoiceGatewayEnv(process.env);
  const additionalProperties: Record<string, unknown> = {
    ...redactTelemetryProperties({
      ...input?.properties,
      deploymentMode: env.DEPLOYMENT_MODE,
      runtime: "voice-gateway",
    }),
  };

  if (input?.businessId) {
    additionalProperties.$groups = {
      business: getPostHogBusinessGroupKey(input.businessId),
    };
  }

  activeClient.captureException(
    error,
    input?.distinctId ??
      (input?.businessId
        ? getPostHogDistinctIdForBusinessSystem(input.businessId)
        : undefined),
    additionalProperties,
  );
}
