import {
  action,
  httpAction,
  internalAction,
  internalMutation,
  mutation,
} from "../_generated/server";
import type { ActionCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type {
  ArgsArrayForOptionalValidator,
  ArgsArrayToObject,
  DefaultArgsForOptionalValidator,
  RegisteredAction,
  ReturnValueForOptionalValidator,
} from "convex/server";
import type { PropertyValidators, Validator } from "convex/values";
import {
  getPostHogBusinessGroupKey,
  isExpectedConvexFailure,
} from "../../packages/telemetry/src/index";

import {
  enqueuePostHogExceptionBestEffort,
  getPostHogDistinctIdForConvexSystem,
} from "./posthog";

type ObservabilityOptions = {
  operation?: string;
  service?: string;
  alertable?: boolean;
  expected?: boolean;
  businessId?:
    | string
    | ((ctx: ConvexRunnerCtx, args: unknown) => string | undefined | Promise<string | undefined>);
  groupKey?:
    | string
    | ((ctx: ConvexRunnerCtx, args: unknown) => string | undefined | Promise<string | undefined>);
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

async function resolveObservabilityContext(
  value:
    | string
    | ((ctx: ConvexRunnerCtx, args: unknown) => string | undefined | Promise<string | undefined>)
    | undefined,
  ctx: ConvexRunnerCtx,
  args: unknown,
): Promise<string | undefined> {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "function") {
    try {
      return await value(ctx, args);
    } catch {
      return undefined;
    }
  }
  return value;
}

async function reportConvexHandlerFailure(input: {
  ctx: ConvexRunnerCtx;
  error: unknown;
  args?: unknown;
  kind: "action" | "http_action" | "internal_action" | "mutation" | "internal_mutation";
  options: ObservabilityOptions;
}): Promise<void> {
  const expected = input.options.expected ?? isExpectedConvexFailure(input.error);
  const [businessId, groupKey] = await Promise.all([
    resolveObservabilityContext(input.options.businessId, input.ctx, input.args),
    resolveObservabilityContext(input.options.groupKey, input.ctx, input.args),
  ]);
  const resolvedBusinessId = businessId as Id<"businesses"> | undefined;
  const resolvedGroupKey =
    groupKey ??
    (resolvedBusinessId !== undefined
      ? getPostHogBusinessGroupKey(resolvedBusinessId)
      : undefined);
  await enqueuePostHogExceptionBestEffort(input.ctx, {
    error: input.error,
    service: input.options.service ?? DEFAULT_SERVICE,
    operation: input.options.operation ?? `convex_${input.kind}`,
    distinctId: getPostHogDistinctIdForConvexSystem(),
    alertable: input.options.alertable ?? !expected,
    expected,
    ...(resolvedBusinessId !== undefined
      ? { businessId: resolvedBusinessId }
      : {}),
    ...(resolvedGroupKey !== undefined ? { groupKey: resolvedGroupKey } : {}),
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
          args,
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

export type ObservableActionDefinition<
  ArgsValidator extends
    | PropertyValidators
    | Validator<any, "required", any>
    | void,
  ReturnsValidator extends
    | PropertyValidators
    | Validator<any, "required", any>
    | void,
  ReturnValue extends ReturnValueForOptionalValidator<ReturnsValidator> = any,
  OneOrZeroArgs extends
    ArgsArrayForOptionalValidator<ArgsValidator> = DefaultArgsForOptionalValidator<ArgsValidator>,
> = {
  args?: ArgsValidator;
  returns?: ReturnsValidator;
  observability?: ObservabilityOptions;
  handler: (ctx: ActionCtx, ...args: OneOrZeroArgs) => ReturnValue;
};

export const observedAction = <
  ArgsValidator extends
    | PropertyValidators
    | Validator<any, "required", any>
    | void,
  ReturnsValidator extends
    | PropertyValidators
    | Validator<any, "required", any>
    | void,
  ReturnValue extends ReturnValueForOptionalValidator<ReturnsValidator> = any,
  OneOrZeroArgs extends
    ArgsArrayForOptionalValidator<ArgsValidator> = DefaultArgsForOptionalValidator<ArgsValidator>,
>(
  definition: ObservableActionDefinition<
    ArgsValidator,
    ReturnsValidator,
    ReturnValue,
    OneOrZeroArgs
  >,
): RegisteredAction<"public", ArgsArrayToObject<OneOrZeroArgs>, ReturnValue> =>
  action(
    observeConfigHandler(definition as ObservableDefinition, "action") as Parameters<
      typeof action
    >[0],
  );

export const observedInternalAction = <
  ArgsValidator extends
    | PropertyValidators
    | Validator<any, "required", any>
    | void,
  ReturnsValidator extends
    | PropertyValidators
    | Validator<any, "required", any>
    | void,
  ReturnValue extends ReturnValueForOptionalValidator<ReturnsValidator> = any,
  OneOrZeroArgs extends
    ArgsArrayForOptionalValidator<ArgsValidator> = DefaultArgsForOptionalValidator<ArgsValidator>,
>(
  definition: ObservableActionDefinition<
    ArgsValidator,
    ReturnsValidator,
    ReturnValue,
    OneOrZeroArgs
  >,
): RegisteredAction<"internal", ArgsArrayToObject<OneOrZeroArgs>, ReturnValue> =>
  internalAction(
    observeConfigHandler(
      definition as ObservableDefinition,
      "internal_action",
    ) as Parameters<typeof internalAction>[0],
  );

export const observedMutation = ((
  definition: Parameters<typeof mutation>[0],
) =>
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
