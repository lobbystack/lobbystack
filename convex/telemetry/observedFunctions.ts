import {
  action,
  httpAction,
  internalAction,
  internalMutation,
  mutation,
} from "../_generated/server";
import type { ActionCtx, MutationCtx } from "../_generated/server";
import { isExpectedConvexFailure } from "../../packages/telemetry/src/index";

import {
  enqueuePostHogExceptionBestEffort,
  getPostHogDistinctIdForConvexSystem,
} from "./posthog";

type ObservabilityOptions = {
  operation?: string;
  service?: string;
  alertable?: boolean;
  expected?: boolean;
};

type ObservableDefinition = {
  handler?: unknown;
  observability?: ObservabilityOptions;
};

type ConvexRunnerCtx = ActionCtx | MutationCtx;

const DEFAULT_SERVICE = "convex";

function getObservedOptions(definition: unknown): ObservabilityOptions {
  if (!definition || typeof definition !== "object") {
    return {};
  }
  const options = (definition as ObservableDefinition).observability;
  return options && typeof options === "object" ? options : {};
}

function withoutObservabilityOption<T>(definition: T): T {
  if (!definition || typeof definition !== "object") {
    return definition;
  }
  const { observability: _observability, ...rest } =
    definition as T & { observability?: ObservabilityOptions };
  return rest as T;
}

async function reportConvexHandlerFailure(input: {
  ctx: ConvexRunnerCtx;
  error: unknown;
  kind: "action" | "http_action" | "internal_action" | "mutation" | "internal_mutation";
  options: ObservabilityOptions;
}): Promise<void> {
  const expected = input.options.expected ?? isExpectedConvexFailure(input.error);
  await enqueuePostHogExceptionBestEffort(input.ctx, {
    error: input.error,
    service: input.options.service ?? DEFAULT_SERVICE,
    operation: input.options.operation ?? `convex_${input.kind}`,
    distinctId: getPostHogDistinctIdForConvexSystem(),
    alertable: input.options.alertable ?? !expected,
    expected,
    properties: {
      convexFunctionType: input.kind,
    },
  });
}

function observeConfigHandler<T extends ObservableDefinition>(
  definition: T,
  kind: Parameters<typeof reportConvexHandlerFailure>[0]["kind"],
  wrapperOptions?: {
    reportFailures?: boolean;
  },
): T {
  const handler = definition.handler;
  if (typeof handler !== "function") {
    return withoutObservabilityOption(definition);
  }
  if (wrapperOptions?.reportFailures === false) {
    // Mutation failures roll back the whole transaction, including telemetry writes.
    // Public mutations are observed by the web client and internal mutations bubble to actions.
    return withoutObservabilityOption(definition);
  }
  const options = getObservedOptions(definition);
  return {
    ...withoutObservabilityOption(definition),
    handler: async (ctx: ConvexRunnerCtx, args: unknown) => {
      try {
        return await handler(ctx, args);
      } catch (error) {
        await reportConvexHandlerFailure({
          ctx,
          error,
          kind,
          options,
        });
        throw error;
      }
    },
  } as T;
}

function observeHttpHandler<T extends (ctx: ActionCtx, request: Request) => unknown>(
  handler: T,
): T {
  return (async (ctx: ActionCtx, request: Request) => {
    try {
      return await handler(ctx, request);
    } catch (error) {
      await reportConvexHandlerFailure({
        ctx,
        error,
        kind: "http_action",
        options: {},
      });
      throw error;
    }
  }) as T;
}

export const observedAction = ((definition: Parameters<typeof action>[0]) =>
  action(
    observeConfigHandler(definition as ObservableDefinition, "action") as Parameters<
      typeof action
    >[0],
  )) as typeof action;

export const observedInternalAction = ((
  definition: Parameters<typeof internalAction>[0],
) =>
  internalAction(
    observeConfigHandler(
      definition as ObservableDefinition,
      "internal_action",
    ) as Parameters<typeof internalAction>[0],
  )) as typeof internalAction;

export const observedMutation = ((definition: Parameters<typeof mutation>[0]) =>
  mutation(
    observeConfigHandler(definition as ObservableDefinition, "mutation", {
      reportFailures: false,
    }) as Parameters<typeof mutation>[0],
  )) as typeof mutation;

export const observedInternalMutation = ((
  definition: Parameters<typeof internalMutation>[0],
) =>
  internalMutation(
    observeConfigHandler(
      definition as ObservableDefinition,
      "internal_mutation",
      {
        reportFailures: false,
      },
    ) as Parameters<typeof internalMutation>[0],
  )) as typeof internalMutation;

export const observedHttpAction = ((handler: Parameters<typeof httpAction>[0]) =>
  httpAction(observeHttpHandler(handler))) as typeof httpAction;
