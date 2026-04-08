import {
  buildPostHogAiGenerationProperties,
  buildPostHogAiSpanProperties,
  buildPostHogAiTraceProperties,
  type PostHogAiGenerationPropertiesInput,
  type PostHogAiSpanPropertiesInput,
  type PostHogAiTracePropertiesInput,
  type TelemetryProperties,
} from "../../packages/telemetry/src/index";

import type { Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx } from "../_generated/server";
import {
  getPostHogBusinessGroupKey,
  getPostHogDistinctIdForBusinessSystem,
} from "./shared";
import { enqueuePostHogEventBestEffort } from "./posthog";

type TelemetryMutationRunner = Pick<ActionCtx | MutationCtx, "runMutation">;

type BusinessTelemetryInput = {
  businessId: Id<"businesses">;
  distinctId?: string;
  groupKey?: string;
};

type CaptureAiTraceInput = BusinessTelemetryInput &
  PostHogAiTracePropertiesInput & {
    properties?: TelemetryProperties;
  };

type CaptureAiGenerationInput = BusinessTelemetryInput &
  PostHogAiGenerationPropertiesInput;

type CaptureAiSpanInput = BusinessTelemetryInput & PostHogAiSpanPropertiesInput;

function getDistinctId(input: BusinessTelemetryInput): string {
  return (
    input.distinctId ??
    getPostHogDistinctIdForBusinessSystem(String(input.businessId))
  );
}

function getGroupKey(input: BusinessTelemetryInput): string {
  return input.groupKey ?? getPostHogBusinessGroupKey(String(input.businessId));
}

export async function captureAiTraceStartedBestEffort(
  ctx: TelemetryMutationRunner,
  input: CaptureAiTraceInput,
): Promise<void> {
  await enqueuePostHogEventBestEffort(ctx, {
    eventName: "$ai_trace",
    businessId: input.businessId,
    distinctId: getDistinctId(input),
    groupKey: getGroupKey(input),
    ...(input.callId ? { callId: input.callId } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    provider: input.provider,
    model: input.model,
    properties: {
      ...buildPostHogAiTraceProperties(input),
      ...input.properties,
    },
  });
}

export async function captureAiGenerationBestEffort(
  ctx: TelemetryMutationRunner,
  input: CaptureAiGenerationInput,
): Promise<void> {
  await enqueuePostHogEventBestEffort(ctx, {
    eventName: "$ai_generation",
    businessId: input.businessId,
    distinctId: getDistinctId(input),
    groupKey: getGroupKey(input),
    ...(input.callId ? { callId: input.callId } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    provider: input.provider,
    model: input.model,
    properties: buildPostHogAiGenerationProperties(input),
  });
}

export async function captureAiSpanBestEffort(
  ctx: TelemetryMutationRunner,
  input: CaptureAiSpanInput,
): Promise<void> {
  await enqueuePostHogEventBestEffort(ctx, {
    eventName: "$ai_span",
    businessId: input.businessId,
    distinctId: getDistinctId(input),
    groupKey: getGroupKey(input),
    ...(input.callId ? { callId: input.callId } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    provider: input.provider,
    model: input.model,
    properties: buildPostHogAiSpanProperties(input),
  });
}
